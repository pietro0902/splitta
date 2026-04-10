export type Group = {
  id: number;
  name: string;
  emoji: string;
  invite_token: string | null;
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
  category: string | null;
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

export type SettlementRecord = {
  id: number;
  group_id: number;
  from_member_id: number;
  to_member_id: number;
  amount: number;
  created_at: string;
  from_name: string;
  from_color: string;
  to_name: string;
  to_color: string;
};

export type ShoppingItem = {
  id: number;
  group_id: number;
  name: string;
  quantity: string | null;
  added_by_member_id: number | null;
  checked: number;
  created_at: string;
  added_by_name?: string;
  added_by_color?: string;
};

export const EXPENSE_CATEGORIES = [
  { id: "food", label: "Food", emoji: "🍕" },
  { id: "groceries", label: "Groceries", emoji: "🛒" },
  { id: "transport", label: "Transport", emoji: "🚗" },
  { id: "rent", label: "Rent", emoji: "🏠" },
  { id: "utilities", label: "Utilities", emoji: "💡" },
  { id: "entertainment", label: "Entertainment", emoji: "🎬" },
  { id: "shopping", label: "Shopping", emoji: "🛍️" },
  { id: "health", label: "Health", emoji: "💊" },
  { id: "travel", label: "Travel", emoji: "✈️" },
  { id: "other", label: "Other", emoji: "📦" },
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]["id"];
