import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { Group, Member, ExpenseRow, ExpenseSplit, ExpensePayer, Settlement, SettlementRecord, ShoppingItem } from "./db-types";
import type { SplitInput, SplitMode } from "./splits";
import type { PayerInput } from "./payers";

async function getDb(): Promise<D1Database> {
  if (process.env.NODE_ENV === "development") {
    const { LocalD1Database } = await import("./local-d1");
    return new LocalD1Database() as unknown as D1Database;
  }
  const { env } = await getCloudflareContext<{ env: CloudflareEnv }>({ async: true });
  return env.DB;
}

const colors = [
  "#C4572A", "#6B7C3D", "#D4A853", "#4A7C8F", "#8B5E83",
  "#C47F3A", "#5B8C6A", "#9E5A5A", "#6A7BA2", "#A68B3C",
];

export const db = {
  // Only the groups this client has been granted access to. Everything the
  // homepage renders comes from here, so the filter has to be in the query --
  // narrowing a full list client-side (as this used to) still ships every
  // group's name, members and spend to every visitor in the HTML.
  //
  // Two round trips regardless of how many groups come back, instead of the
  // 1 + 2N this did before: the totals are a correlated subquery, and the
  // members of every matched group are fetched together.
  //
  // `myBalanceCents` is the figure the homepage leads with, and it is the same
  // arithmetic getBalances does for a whole group -- what I paid, minus what I
  // owe, plus what I have settled -- but restricted to the one member this
  // client said it is and evaluated for every group at once. Doing it by
  // calling getBalances per group would be 3N queries to render a list.
  //
  // A NULL `ga.member_id` (this browser never answered "who are you?") makes
  // every subquery sum nothing, so the raw figure would read as a tidy zero.
  // That is a lie -- zero means settled -- so it is mapped to null below and
  // the UI says nothing rather than something wrong.
  async getGroups(clientId: string) {
    const d1 = await getDb();
    const { results: groups } = await d1
      .prepare(
        `SELECT g.*,
                ga.member_id AS my_member_id,
                COALESCE((SELECT SUM(e.amount_cents) FROM expenses e WHERE e.group_id = g.id), 0) AS totalExpensesCents,
                COALESCE((SELECT SUM(ep.amount_cents) FROM expense_payers ep
                            JOIN expenses e ON e.id = ep.expense_id
                           WHERE e.group_id = g.id AND ep.member_id = ga.member_id), 0)
              - COALESCE((SELECT SUM(es.amount_cents) FROM expense_splits es
                            JOIN expenses e ON e.id = es.expense_id
                           WHERE e.group_id = g.id AND es.member_id = ga.member_id), 0)
              + COALESCE((SELECT SUM(s.amount_cents) FROM settlements s
                           WHERE s.group_id = g.id AND s.from_member_id = ga.member_id), 0)
              - COALESCE((SELECT SUM(s.amount_cents) FROM settlements s
                           WHERE s.group_id = g.id AND s.to_member_id = ga.member_id), 0)
                AS myBalanceCents
         FROM groups g
         JOIN group_access ga ON ga.group_id = g.id
         WHERE ga.client_id = ?
         ORDER BY g.created_at DESC`
      )
      .bind(clientId)
      .all<Group & { totalExpensesCents: number; myBalanceCents: number; my_member_id: number | null }>();

    if (groups.length === 0) return [];

    const placeholders = groups.map(() => "?").join(",");
    const { results: members } = await d1
      .prepare(`SELECT * FROM members WHERE group_id IN (${placeholders})`)
      .bind(...groups.map((g) => g.id))
      .all<Member>();

    const byGroup = new Map<number, Member[]>();
    for (const m of members) {
      const arr = byGroup.get(m.group_id) || [];
      arr.push(m);
      byGroup.set(m.group_id, arr);
    }

    return groups.map(({ my_member_id, ...g }) => ({
      ...g,
      members: byGroup.get(g.id) || [],
      myMemberId: my_member_id,
      myBalanceCents: my_member_id === null ? null : g.myBalanceCents,
    }));
  },

  // --- access control -------------------------------------------------------

  async hasAccess(groupId: number, clientId: string) {
    const d1 = await getDb();
    const row = await d1
      .prepare("SELECT 1 AS ok FROM group_access WHERE group_id = ? AND client_id = ?")
      .bind(groupId, clientId)
      .first<{ ok: number }>();
    return row !== null;
  },

  // Redeeming an invite a second time (say, after picking the wrong name)
  // updates which member you claimed to be rather than failing.
  async grantAccess(groupId: number, clientId: string, memberId: number | null) {
    const d1 = await getDb();
    await d1
      .prepare(
        `INSERT INTO group_access (group_id, client_id, member_id) VALUES (?, ?, ?)
         ON CONFLICT(group_id, client_id) DO UPDATE SET member_id = excluded.member_id`
      )
      .bind(groupId, clientId, memberId)
      .run();
  },

  // Which member this client is in this group, or null if they never said.
  async getAccessMemberId(groupId: number, clientId: string) {
    const d1 = await getDb();
    const row = await d1
      .prepare("SELECT member_id FROM group_access WHERE group_id = ? AND client_id = ?")
      .bind(groupId, clientId)
      .first<{ member_id: number | null }>();
    return row?.member_id ?? null;
  },

  async setAccessMember(groupId: number, clientId: string, memberId: number) {
    const d1 = await getDb();
    await d1
      .prepare("UPDATE group_access SET member_id = ? WHERE group_id = ? AND client_id = ?")
      .bind(memberId, groupId, clientId)
      .run();
  },

  async getMemberIds(groupId: number) {
    const d1 = await getDb();
    const { results } = await d1
      .prepare("SELECT id FROM members WHERE group_id = ?")
      .bind(groupId)
      .all<{ id: number }>();
    return results.map((r) => r.id);
  },

  // Guard for the actions that address expenses by their own id: being a member
  // of group A must not let you edit an expense that lives in group B. Takes
  // the whole set at once so editing a 20-line receipt stays one query.
  async filterExpenseIdsInGroup(groupId: number, ids: number[]) {
    if (ids.length === 0) return [];
    const d1 = await getDb();
    const placeholders = ids.map(() => "?").join(",");
    const { results } = await d1
      .prepare(`SELECT id FROM expenses WHERE group_id = ? AND id IN (${placeholders})`)
      .bind(groupId, ...ids)
      .all<{ id: number }>();
    return results.map((r) => r.id);
  },

  async getGroup(id: number) {
    const d1 = await getDb();
    const group = await d1
      .prepare("SELECT * FROM groups WHERE id = ?")
      .bind(id)
      .first<Group>();
    if (!group) return null;
    return {
      ...group,
      members: await this.getMembers(group.id),
      expenses: await this.getExpenses(group.id),
      totalExpensesCents: await this.getGroupTotal(group.id),
    };
  },

  // `meIndex` is which of `memberNames` the creator says they are, or undefined
  // if they skipped the question. Without it the group is reachable but
  // anonymous: the server knows this browser may look, not who it is looking
  // as, and every "your balance" figure is uncomputable.
  async createGroup(
    name: string,
    emoji: string,
    memberNames: string[],
    clientId: string,
    meIndex?: number
  ) {
    const d1 = await getDb();
    const inviteToken = crypto.randomUUID();
    const groupResult = await d1
      .prepare("INSERT INTO groups (name, emoji, invite_token) VALUES (?, ?, ?)")
      .bind(name, emoji, inviteToken)
      .run();
    const groupId = groupResult.meta.last_row_id;

    const stmts = [
      ...memberNames.map((memberName, i) =>
        d1
          .prepare("INSERT INTO members (group_id, name, color) VALUES (?, ?, ?)")
          .bind(groupId, memberName, colors[i % colors.length])
      ),
      // In the same batch as the members: a group whose creator has no access
      // row is unreachable by anyone, including them.
      d1
        .prepare("INSERT INTO group_access (group_id, client_id, member_id) VALUES (?, ?, NULL)")
        .bind(groupId, clientId),
    ];
    await d1.batch(stmts);

    // Resolving the creator's identity happens after the batch, because a
    // member's id only exists once its row does, and the ids follow insertion
    // order. Deliberately not part of the batch: if this half fails the group
    // is still reachable, and the "who are you?" prompt on the group page
    // picks up the missing answer.
    if (meIndex !== undefined && meIndex >= 0 && meIndex < memberNames.length) {
      const { results } = await d1
        .prepare("SELECT id FROM members WHERE group_id = ? ORDER BY id")
        .bind(groupId)
        .all<{ id: number }>();
      const memberId = results[meIndex]?.id;
      if (memberId) {
        await d1
          .prepare("UPDATE group_access SET member_id = ? WHERE group_id = ? AND client_id = ?")
          .bind(memberId, groupId, clientId)
          .run();
      }
    }

    return groupId;
  },

  async deleteGroup(id: number) {
    const d1 = await getDb();
    await d1.prepare("DELETE FROM groups WHERE id = ?").bind(id).run();
  },

  async updateGroup(id: number, name: string, emoji: string) {
    const d1 = await getDb();
    await d1
      .prepare("UPDATE groups SET name = ?, emoji = ? WHERE id = ?")
      .bind(name, emoji, id)
      .run();
  },

  // Give up your own access to a group without touching the group itself. The
  // only exit before this was deleting it, which deletes it for everybody.
  async revokeAccess(groupId: number, clientId: string) {
    const d1 = await getDb();
    await d1
      .prepare("DELETE FROM group_access WHERE group_id = ? AND client_id = ?")
      .bind(groupId, clientId)
      .run();
  },

  // How many rows in this group point at this member. It has to be zero before
  // the member can be deleted, and the reason is worth stating: every foreign
  // key that reaches `members` is ON DELETE CASCADE. Removing somebody who has
  // paid for something therefore does not orphan a row, it *deletes the
  // expense* -- and removing somebody who merely owes a share deletes that
  // share, leaving an expense whose splits no longer sum to its amount. The
  // database will do all of this silently, so the guard has to be here.
  //
  // `expenses.paid_by_member_id` is counted too: it is the legacy column kept
  // by migration 0009 (SQLite cannot drop a column), it still carries its
  // cascade, and it is still set on every expense written since.
  async countMemberActivity(groupId: number, memberId: number) {
    const d1 = await getDb();
    const row = await d1
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM expense_payers ep
              JOIN expenses e ON e.id = ep.expense_id
             WHERE e.group_id = ?1 AND ep.member_id = ?2)
         + (SELECT COUNT(*) FROM expense_splits es
              JOIN expenses e ON e.id = es.expense_id
             WHERE e.group_id = ?1 AND es.member_id = ?2)
         + (SELECT COUNT(*) FROM expenses e
             WHERE e.group_id = ?1 AND e.paid_by_member_id = ?2)
         + (SELECT COUNT(*) FROM settlements s
             WHERE s.group_id = ?1 AND (s.from_member_id = ?2 OR s.to_member_id = ?2))
           AS n`
      )
      .bind(groupId, memberId)
      .first<{ n: number }>();
    return row?.n ?? 0;
  },

  async removeMember(groupId: number, memberId: number) {
    const d1 = await getDb();
    await d1
      .prepare("DELETE FROM members WHERE id = ? AND group_id = ?")
      .bind(memberId, groupId)
      .run();
  },

  async getMembers(groupId: number) {
    const d1 = await getDb();
    const { results } = await d1
      .prepare("SELECT * FROM members WHERE group_id = ?")
      .bind(groupId)
      .all<Member>();
    return results;
  },

  // The colour is picked here rather than passed in: the palette lives in this
  // module, so a caller that had to know it is a caller that can get it wrong --
  // the old signature took one and its only would-be caller would have had to
  // hard-code a default, giving every late arrival the same terracotta.
  //
  // First shade nobody in the group is using, so somebody added in September is
  // as distinguishable as the people named when the group was created.
  async addMember(groupId: number, name: string) {
    const d1 = await getDb();
    const { results: existing } = await d1
      .prepare("SELECT color FROM members WHERE group_id = ?")
      .bind(groupId)
      .all<{ color: string }>();

    const used = new Set(existing.map((m) => m.color));
    const color = colors.find((c) => !used.has(c)) ?? colors[existing.length % colors.length];

    const result = await d1
      .prepare("INSERT INTO members (group_id, name, color) VALUES (?, ?, ?)")
      .bind(groupId, name, color)
      .run();
    return result.meta.last_row_id;
  },

  async getExpenses(groupId: number) {
    const d1 = await getDb();
    // receipt_name comes from the receipts table (0015) rather than from a copy
    // on every line, but it still arrives on the expense so the list and the
    // grouping code read it exactly as before.
    const { results: expenses } = await d1
      .prepare(
        `SELECT e.*,
                r.name AS receipt_name,
                r.declared_total_cents AS receipt_declared_total_cents
         FROM expenses e
         LEFT JOIN receipts r ON r.id = e.receipt_id
         WHERE e.group_id = ?
         -- By the day it was spent, then by insertion order within that day.
         -- Ordering by created_at alone put a dinner from last week, entered
         -- today, above everything that actually happened since.
         ORDER BY COALESCE(e.spent_at, e.created_at) DESC, e.id DESC`
      )
      .bind(groupId)
      .all<ExpenseRow>();

    if (expenses.length === 0) return [];

    // Fetch all splits and all payers for all expenses in this group in one query each
    const expenseIds = expenses.map((e) => e.id);
    const placeholders = expenseIds.map(() => "?").join(",");
    const { results: allSplits } = await d1
      .prepare(
        `SELECT es.*, m.name as member_name, m.color as member_color
         FROM expense_splits es
         JOIN members m ON es.member_id = m.id
         WHERE es.expense_id IN (${placeholders})`
      )
      .bind(...expenseIds)
      .all<ExpenseSplit>();

    const { results: allPayers } = await d1
      .prepare(
        `SELECT ep.*, m.name as member_name, m.color as member_color
         FROM expense_payers ep
         JOIN members m ON ep.member_id = m.id
         WHERE ep.expense_id IN (${placeholders})`
      )
      .bind(...expenseIds)
      .all<ExpensePayer>();

    const splitsByExpense = new Map<number, ExpenseSplit[]>();
    for (const split of allSplits) {
      const arr = splitsByExpense.get(split.expense_id) || [];
      arr.push(split);
      splitsByExpense.set(split.expense_id, arr);
    }

    const payersByExpense = new Map<number, ExpensePayer[]>();
    for (const payer of allPayers) {
      const arr = payersByExpense.get(payer.expense_id) || [];
      arr.push(payer);
      payersByExpense.set(payer.expense_id, arr);
    }

    return expenses.map((e) => ({
      ...e,
      splits: splitsByExpense.get(e.id) || [],
      payers: payersByExpense.get(e.id) || [],
    }));
  },

  async addExpense(
    groupId: number,
    description: string,
    amountCents: number,
    payers: PayerInput[],
    splits: SplitInput[],
    splitMode: SplitMode,
    receiptId?: string,
    category?: string,
    // Omitted means "now", which is what the column default already says.
    spentAt?: string
  ) {
    const d1 = await getDb();
    const primaryPayerId = payers.reduce((a, b) => (b.amount > a.amount ? b : a)).memberId;

    const expenseResult = await d1
      .prepare(
        `INSERT INTO expenses
           (group_id, description, amount_cents, paid_by_member_id, receipt_id, category, split_mode, spent_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))`
      )
      .bind(
        groupId,
        description,
        amountCents,
        primaryPayerId,
        receiptId ?? null,
        category ?? null,
        splitMode,
        spentAt ?? null
      )
      .run();
    const expenseId = expenseResult.meta.last_row_id;

    const stmts = [
      ...payers.map((p) =>
        d1
          .prepare("INSERT INTO expense_payers (expense_id, member_id, amount_cents) VALUES (?, ?, ?)")
          .bind(expenseId, p.memberId, p.amount)
      ),
      ...splits.map((s) =>
        d1
          .prepare(
            "INSERT INTO expense_splits (expense_id, member_id, amount_cents, weight) VALUES (?, ?, ?, ?)"
          )
          .bind(expenseId, s.memberId, s.amount, s.weight ?? null)
      ),
    ];
    await d1.batch(stmts);
    return expenseId;
  },

  // Create or update the receipt a scan belongs to. Called before its lines are
  // written, so `expenses.receipt_id` never points at nothing.
  // The day a receipt is filed under: the earliest of its lines, matching what
  // `receiptDate` computes for display. Used when a line is added to an existing
  // receipt, so the new row joins the shop's own day instead of today's.
  async getReceiptSpentAt(receiptId: string, groupId: number) {
    const d1 = await getDb();
    const row = await d1
      .prepare(
        `SELECT MIN(COALESCE(spent_at, created_at)) AS day
           FROM expenses WHERE receipt_id = ? AND group_id = ?`
      )
      .bind(receiptId, groupId)
      .first<{ day: string | null }>();
    return row?.day ?? undefined;
  },

  async upsertReceipt(
    receiptId: string,
    groupId: number,
    name: string | null,
    category: string | null,
    declaredTotalCents: number | null
  ) {
    const d1 = await getDb();
    await d1
      .prepare(
        `INSERT INTO receipts (id, group_id, name, category, declared_total_cents)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           category = excluded.category,
           declared_total_cents = COALESCE(excluded.declared_total_cents, receipts.declared_total_cents)`
      )
      .bind(receiptId, groupId, name, category, declaredTotalCents)
      .run();
  },

  async updateExpense(
    expenseId: number,
    groupId: number,
    description: string,
    amountCents: number,
    payers: PayerInput[],
    splits: SplitInput[],
    splitMode: SplitMode,
    category?: string,
    // Omitted leaves the stored date alone, so a caller that does not deal in
    // dates cannot blank one out.
    spentAt?: string
  ) {
    const d1 = await getDb();
    const primaryPayerId = payers.reduce((a, b) => (b.amount > a.amount ? b : a)).memberId;

    await d1
      .prepare(
        `UPDATE expenses
            SET description = ?, amount_cents = ?, paid_by_member_id = ?, category = ?,
                split_mode = ?, spent_at = COALESCE(?, spent_at)
          WHERE id = ? AND group_id = ?`
      )
      .bind(
        description,
        amountCents,
        primaryPayerId,
        category ?? null,
        splitMode,
        spentAt ?? null,
        expenseId,
        groupId
      )
      .run();

    // Delete old payers/splits and insert the new ones
    await d1.prepare("DELETE FROM expense_payers WHERE expense_id = ?").bind(expenseId).run();
    await d1.prepare("DELETE FROM expense_splits WHERE expense_id = ?").bind(expenseId).run();

    const stmts = [
      ...payers.map((p) =>
        d1
          .prepare("INSERT INTO expense_payers (expense_id, member_id, amount_cents) VALUES (?, ?, ?)")
          .bind(expenseId, p.memberId, p.amount)
      ),
      ...splits.map((s) =>
        d1
          .prepare(
            "INSERT INTO expense_splits (expense_id, member_id, amount_cents, weight) VALUES (?, ?, ?, ?)"
          )
          .bind(expenseId, s.memberId, s.amount, s.weight ?? null)
      ),
    ];
    await d1.batch(stmts);
  },

  async deleteExpense(id: number, groupId: number) {
    const d1 = await getDb();
    await d1.prepare("DELETE FROM expenses WHERE id = ? AND group_id = ?").bind(id, groupId).run();
  },

  async getGroupTotal(groupId: number) {
    const d1 = await getDb();
    const result = await d1
      .prepare(
        "SELECT COALESCE(SUM(amount_cents), 0) as total FROM expenses WHERE group_id = ?"
      )
      .bind(groupId)
      .first<{ total: number }>();
    return result?.total ?? 0;
  },

  async getSettlements(groupId: number) {
    const balanceData = await this.getBalances(groupId);
    const debtors: { member: Member; amount: number }[] = [];
    const creditors: { member: Member; amount: number }[] = [];

    // In cents, "owes something" is just a non-zero integer -- the one-cent
    // tolerances that used to be here existed only to absorb float noise.
    balanceData.forEach(({ member, balance_cents }) => {
      if (balance_cents < 0) debtors.push({ member, amount: -balance_cents });
      else if (balance_cents > 0) creditors.push({ member, amount: balance_cents });
    });

    debtors.sort((a, b) => b.amount - a.amount);
    creditors.sort((a, b) => b.amount - a.amount);

    const settlements: Settlement[] = [];
    let i = 0;
    let j = 0;
    while (i < debtors.length && j < creditors.length) {
      const amount = Math.min(debtors[i].amount, creditors[j].amount);
      if (amount > 0) {
        settlements.push({
          from: debtors[i].member,
          to: creditors[j].member,
          amount_cents: amount,
        });
      }
      debtors[i].amount -= amount;
      creditors[j].amount -= amount;
      if (debtors[i].amount === 0) i++;
      if (creditors[j].amount === 0) j++;
    }
    return settlements;
  },

  async getGroupByToken(token: string) {
    const d1 = await getDb();
    const group = await d1
      .prepare("SELECT * FROM groups WHERE invite_token = ?")
      .bind(token)
      .first<Group>();
    if (!group) return null;
    return {
      ...group,
      members: await this.getMembers(group.id),
    };
  },

  async ensureInviteToken(groupId: number) {
    const d1 = await getDb();
    const group = await d1
      .prepare("SELECT invite_token FROM groups WHERE id = ?")
      .bind(groupId)
      .first<{ invite_token: string | null }>();
    if (group?.invite_token) return group.invite_token;

    const token = crypto.randomUUID();
    await d1
      .prepare("UPDATE groups SET invite_token = ? WHERE id = ?")
      .bind(token, groupId)
      .run();
    return token;
  },

  // Settlement records
  async recordSettlement(groupId: number, fromMemberId: number, toMemberId: number, amountCents: number) {
    const d1 = await getDb();
    await d1
      .prepare("INSERT INTO settlements (group_id, from_member_id, to_member_id, amount_cents) VALUES (?, ?, ?, ?)")
      .bind(groupId, fromMemberId, toMemberId, amountCents)
      .run();
  },

  async getSettlementRecords(groupId: number) {
    const d1 = await getDb();
    const { results } = await d1
      .prepare(
        `SELECT s.*,
          mf.name as from_name, mf.color as from_color,
          mt.name as to_name, mt.color as to_color
         FROM settlements s
         JOIN members mf ON s.from_member_id = mf.id
         JOIN members mt ON s.to_member_id = mt.id
         WHERE s.group_id = ?
         ORDER BY s.created_at DESC`
      )
      .bind(groupId)
      .all<SettlementRecord>();
    return results;
  },

  async deleteSettlementRecord(id: number, groupId: number) {
    const d1 = await getDb();
    await d1
      .prepare("DELETE FROM settlements WHERE id = ? AND group_id = ?")
      .bind(id, groupId)
      .run();
  },

  // Updated balances that account for settlement records
  async getBalances(groupId: number) {
    const members = await this.getMembers(groupId);
    const expenses = await this.getExpenses(groupId);
    const settlementRecords = await this.getSettlementRecords(groupId);

    const balances: Record<number, number> = {};
    members.forEach((m) => (balances[m.id] = 0));

    // Integer cents throughout, so this is exact: a group's balances now sum to
    // zero by construction rather than to within a rounding error of it.
    expenses.forEach((expense) => {
      expense.payers.forEach((payer) => {
        balances[payer.member_id] += payer.amount_cents;
      });
      expense.splits.forEach((split) => {
        balances[split.member_id] -= split.amount_cents;
      });
    });

    // Apply settlements: from pays to, so from's balance goes up, to's goes down
    settlementRecords.forEach((s) => {
      balances[s.from_member_id] += s.amount_cents;
      balances[s.to_member_id] -= s.amount_cents;
    });

    return members.map((m) => ({
      member: m,
      balance_cents: balances[m.id],
    }));
  },

  // Shopping list
  async getShoppingItems(groupId: number) {
    const d1 = await getDb();
    const { results } = await d1
      .prepare(
        `SELECT si.*, m.name as added_by_name, m.color as added_by_color
         FROM shopping_items si
         LEFT JOIN members m ON si.added_by_member_id = m.id
         WHERE si.group_id = ?
         ORDER BY si.checked ASC, si.created_at DESC`
      )
      .bind(groupId)
      .all<ShoppingItem>();
    return results;
  },

  async addShoppingItem(groupId: number, name: string, quantity: string | null, addedByMemberId: number | null) {
    const d1 = await getDb();
    await d1
      .prepare("INSERT INTO shopping_items (group_id, name, quantity, added_by_member_id) VALUES (?, ?, ?, ?)")
      .bind(groupId, name, quantity, addedByMemberId)
      .run();
  },

  async toggleShoppingItem(id: number, checked: boolean, groupId: number) {
    const d1 = await getDb();
    await d1
      .prepare("UPDATE shopping_items SET checked = ? WHERE id = ? AND group_id = ?")
      .bind(checked ? 1 : 0, id, groupId)
      .run();
  },

  async deleteShoppingItem(id: number, groupId: number) {
    const d1 = await getDb();
    await d1
      .prepare("DELETE FROM shopping_items WHERE id = ? AND group_id = ?")
      .bind(id, groupId)
      .run();
  },

  async clearCheckedShoppingItems(groupId: number) {
    const d1 = await getDb();
    await d1
      .prepare("DELETE FROM shopping_items WHERE group_id = ? AND checked = 1")
      .bind(groupId)
      .run();
  },
};

export type {
  Group,
  Member,
  ExpenseRow,
  ExpenseSplit,
  ExpensePayer,
  Expense,
  Settlement,
  GroupWithDetails,
  GroupSummary,
  SettlementRecord,
  ShoppingItem,
  ExpenseCategory,
} from "./db-types";

export { EXPENSE_CATEGORIES } from "./db-types";
