import { getCloudflareContext } from "@opennextjs/cloudflare";

async function getDb(): Promise<D1Database> {
  const { env } = await getCloudflareContext<{ env: CloudflareEnv }>({ async: true });
  return env.DB;
}

const colors = [
  "#C4572A", "#6B7C3D", "#D4A853", "#4A7C8F", "#8B5E83",
  "#C47F3A", "#5B8C6A", "#9E5A5A", "#6A7BA2", "#A68B3C",
];

export const db = {
  async getGroups() {
    const d1 = await getDb();
    const { results: groups } = await d1
      .prepare("SELECT * FROM groups ORDER BY created_at DESC")
      .all<Group>();

    const enriched = await Promise.all(
      groups.map(async (g) => ({
        ...g,
        members: await this.getMembers(g.id),
        totalExpenses: await this.getGroupTotal(g.id),
      }))
    );
    return enriched;
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
      totalExpenses: await this.getGroupTotal(group.id),
    };
  },

  async createGroup(name: string, emoji: string, memberNames: string[]) {
    const d1 = await getDb();
    const groupResult = await d1
      .prepare("INSERT INTO groups (name, emoji) VALUES (?, ?)")
      .bind(name, emoji)
      .run();
    const groupId = groupResult.meta.last_row_id;

    const stmts = memberNames.map((memberName, i) =>
      d1
        .prepare("INSERT INTO members (group_id, name, color) VALUES (?, ?, ?)")
        .bind(groupId, memberName, colors[i % colors.length])
    );
    await d1.batch(stmts);
    return groupId;
  },

  async deleteGroup(id: number) {
    const d1 = await getDb();
    await d1.prepare("DELETE FROM groups WHERE id = ?").bind(id).run();
  },

  async getMembers(groupId: number) {
    const d1 = await getDb();
    const { results } = await d1
      .prepare("SELECT * FROM members WHERE group_id = ?")
      .bind(groupId)
      .all<Member>();
    return results;
  },

  async addMember(groupId: number, name: string, color: string) {
    const d1 = await getDb();
    const result = await d1
      .prepare("INSERT INTO members (group_id, name, color) VALUES (?, ?, ?)")
      .bind(groupId, name, color)
      .run();
    return result.meta.last_row_id;
  },

  async getExpenses(groupId: number) {
    const d1 = await getDb();
    // Single query with JOIN to avoid N+1
    const { results: expenses } = await d1
      .prepare(
        `SELECT e.*, m.name as paid_by_name, m.color as paid_by_color
         FROM expenses e
         JOIN members m ON e.paid_by_member_id = m.id
         WHERE e.group_id = ?
         ORDER BY e.created_at DESC`
      )
      .bind(groupId)
      .all<ExpenseRow>();

    if (expenses.length === 0) return [];

    // Fetch all splits for all expenses in this group in one query
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

    // Group splits by expense_id
    const splitsByExpense = new Map<number, ExpenseSplit[]>();
    for (const split of allSplits) {
      const arr = splitsByExpense.get(split.expense_id) || [];
      arr.push(split);
      splitsByExpense.set(split.expense_id, arr);
    }

    return expenses.map((e) => ({
      ...e,
      splits: splitsByExpense.get(e.id) || [],
    }));
  },

  async addExpense(
    groupId: number,
    description: string,
    amount: number,
    paidByMemberId: number,
    splitMemberIds: number[],
    receiptId?: string,
    receiptName?: string
  ) {
    const d1 = await getDb();
    const splitAmount = amount / splitMemberIds.length;

    const expenseResult = await d1
      .prepare(
        "INSERT INTO expenses (group_id, description, amount, paid_by_member_id, receipt_id, receipt_name) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .bind(groupId, description, amount, paidByMemberId, receiptId ?? null, receiptName ?? null)
      .run();
    const expenseId = expenseResult.meta.last_row_id;

    const stmts = splitMemberIds.map((memberId) =>
      d1
        .prepare(
          "INSERT INTO expense_splits (expense_id, member_id, amount) VALUES (?, ?, ?)"
        )
        .bind(expenseId, memberId, splitAmount)
    );
    await d1.batch(stmts);
    return expenseId;
  },

  async renameReceipt(receiptId: string, name: string) {
    const d1 = await getDb();
    await d1
      .prepare("UPDATE expenses SET receipt_name = ? WHERE receipt_id = ?")
      .bind(name, receiptId)
      .run();
  },

  async deleteExpense(id: number) {
    const d1 = await getDb();
    await d1.prepare("DELETE FROM expenses WHERE id = ?").bind(id).run();
  },

  async getGroupTotal(groupId: number) {
    const d1 = await getDb();
    const result = await d1
      .prepare(
        "SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE group_id = ?"
      )
      .bind(groupId)
      .first<{ total: number }>();
    return result?.total ?? 0;
  },

  async getBalances(groupId: number) {
    const members = await this.getMembers(groupId);
    const expenses = await this.getExpenses(groupId);

    const balances: Record<number, number> = {};
    members.forEach((m) => (balances[m.id] = 0));

    expenses.forEach((expense) => {
      balances[expense.paid_by_member_id] += expense.amount;
      expense.splits.forEach((split) => {
        balances[split.member_id] -= split.amount;
      });
    });

    return members.map((m) => ({
      member: m,
      balance: Math.round(balances[m.id] * 100) / 100,
    }));
  },

  async getSettlements(groupId: number) {
    const balanceData = await this.getBalances(groupId);
    const debtors: { member: Member; amount: number }[] = [];
    const creditors: { member: Member; amount: number }[] = [];

    balanceData.forEach(({ member, balance }) => {
      if (balance < -0.01) debtors.push({ member, amount: -balance });
      else if (balance > 0.01) creditors.push({ member, amount: balance });
    });

    debtors.sort((a, b) => b.amount - a.amount);
    creditors.sort((a, b) => b.amount - a.amount);

    const settlements: Settlement[] = [];
    let i = 0;
    let j = 0;
    while (i < debtors.length && j < creditors.length) {
      const amount = Math.min(debtors[i].amount, creditors[j].amount);
      if (amount > 0.01) {
        settlements.push({
          from: debtors[i].member,
          to: creditors[j].member,
          amount: Math.round(amount * 100) / 100,
        });
      }
      debtors[i].amount -= amount;
      creditors[j].amount -= amount;
      if (debtors[i].amount < 0.01) i++;
      if (creditors[j].amount < 0.01) j++;
    }
    return settlements;
  },
};

export type Group = {
  id: number;
  name: string;
  emoji: string;
  created_at: string;
};

export type Member = {
  id: number;
  group_id: number;
  name: string;
  color: string;
};

export type ExpenseRow = {
  id: number;
  group_id: number;
  description: string;
  amount: number;
  paid_by_member_id: number;
  paid_by_name: string;
  paid_by_color: string;
  created_at: string;
  receipt_id: string | null;
  receipt_name: string | null;
};

export type ExpenseSplit = {
  id: number;
  expense_id: number;
  member_id: number;
  member_name: string;
  member_color: string;
  amount: number;
};

export type Expense = ExpenseRow & { splits: ExpenseSplit[] };

export type Settlement = {
  from: Member;
  to: Member;
  amount: number;
};

export type GroupWithDetails = Group & {
  members: Member[];
  expenses: Expense[];
  totalExpenses: number;
};

export type GroupSummary = Group & {
  members: Member[];
  totalExpenses: number;
};
