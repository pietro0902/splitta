import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "tricount.db");

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma("journal_mode = WAL");
    _db.pragma("foreign_keys = ON");
    initSchema(_db);
  }
  return _db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      emoji TEXT DEFAULT '👥',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      paid_by_member_id INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
      FOREIGN KEY (paid_by_member_id) REFERENCES members(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS expense_splits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_id INTEGER NOT NULL,
      member_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
    );
  `);
}

export const db = {
  getGroups() {
    const groups = getDb()
      .prepare("SELECT * FROM groups ORDER BY created_at DESC")
      .all() as Group[];
    return groups.map((g) => ({
      ...g,
      members: this.getMembers(g.id),
      totalExpenses: this.getGroupTotal(g.id),
    }));
  },

  getGroup(id: number) {
    const group = getDb()
      .prepare("SELECT * FROM groups WHERE id = ?")
      .get(id) as Group | undefined;
    if (!group) return null;
    return {
      ...group,
      members: this.getMembers(group.id),
      expenses: this.getExpenses(group.id),
      totalExpenses: this.getGroupTotal(group.id),
    };
  },

  createGroup(name: string, emoji: string, memberNames: string[]) {
    const colors = [
      "#C4572A", "#6B7C3D", "#D4A853", "#4A7C8F", "#8B5E83",
      "#C47F3A", "#5B8C6A", "#9E5A5A", "#6A7BA2", "#A68B3C",
    ];
    const txn = getDb().transaction(() => {
      const result = getDb()
        .prepare("INSERT INTO groups (name, emoji) VALUES (?, ?)")
        .run(name, emoji);
      const groupId = result.lastInsertRowid as number;
      const insertMember = getDb().prepare(
        "INSERT INTO members (group_id, name, color) VALUES (?, ?, ?)"
      );
      memberNames.forEach((memberName, i) => {
        insertMember.run(groupId, memberName, colors[i % colors.length]);
      });
      return groupId;
    });
    return txn();
  },

  deleteGroup(id: number) {
    getDb().prepare("DELETE FROM groups WHERE id = ?").run(id);
  },

  getMembers(groupId: number) {
    return getDb()
      .prepare("SELECT * FROM members WHERE group_id = ?")
      .all(groupId) as Member[];
  },

  addMember(groupId: number, name: string, color: string) {
    const result = getDb()
      .prepare("INSERT INTO members (group_id, name, color) VALUES (?, ?, ?)")
      .run(groupId, name, color);
    return result.lastInsertRowid as number;
  },

  getExpenses(groupId: number) {
    const expenses = getDb()
      .prepare(
        `SELECT e.*, m.name as paid_by_name, m.color as paid_by_color
         FROM expenses e
         JOIN members m ON e.paid_by_member_id = m.id
         WHERE e.group_id = ?
         ORDER BY e.created_at DESC`
      )
      .all(groupId) as ExpenseRow[];
    return expenses.map((e) => ({
      ...e,
      splits: this.getExpenseSplits(e.id),
    }));
  },

  getExpenseSplits(expenseId: number) {
    return getDb()
      .prepare(
        `SELECT es.*, m.name as member_name, m.color as member_color
         FROM expense_splits es
         JOIN members m ON es.member_id = m.id
         WHERE es.expense_id = ?`
      )
      .all(expenseId) as ExpenseSplit[];
  },

  addExpense(
    groupId: number,
    description: string,
    amount: number,
    paidByMemberId: number,
    splitMemberIds: number[]
  ) {
    const splitAmount = amount / splitMemberIds.length;
    const txn = getDb().transaction(() => {
      const result = getDb()
        .prepare(
          "INSERT INTO expenses (group_id, description, amount, paid_by_member_id) VALUES (?, ?, ?, ?)"
        )
        .run(groupId, description, amount, paidByMemberId);
      const expenseId = result.lastInsertRowid as number;
      const insertSplit = getDb().prepare(
        "INSERT INTO expense_splits (expense_id, member_id, amount) VALUES (?, ?, ?)"
      );
      splitMemberIds.forEach((memberId) => {
        insertSplit.run(expenseId, memberId, splitAmount);
      });
      return expenseId;
    });
    return txn();
  },

  deleteExpense(id: number) {
    getDb().prepare("DELETE FROM expenses WHERE id = ?").run(id);
  },

  getGroupTotal(groupId: number) {
    const result = getDb()
      .prepare(
        "SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE group_id = ?"
      )
      .get(groupId) as { total: number };
    return result.total;
  },

  getBalances(groupId: number) {
    const members = this.getMembers(groupId);
    const expenses = this.getExpenses(groupId);

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

  getSettlements(groupId: number) {
    const balanceData = this.getBalances(groupId);
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
