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
  // Every monetary field in this file is an integer number of cents, matching
  // the columns as of migration 0012. Euros exist only in what the user reads
  // and types; src/lib/money.ts is the only place the two meet.
  amount_cents: number;
  created_at: string;
  receipt_id: string | null;
  receipt_name: string | null;
  category: string | null;
  split_mode: string;
};

export type ExpenseSplit = {
  id: number;
  expense_id: number;
  member_id: number;
  member_name: string;
  member_color: string;
  amount_cents: number;
  // Raw input for the expense's split mode: cents for 'exact', a percentage
  // for 'percent', a share count for 'shares', null for an equal split.
  weight: number | null;
};

export type ExpensePayer = {
  id: number;
  expense_id: number;
  member_id: number;
  member_name: string;
  member_color: string;
  amount_cents: number;
};

export type Expense = ExpenseRow & { splits: ExpenseSplit[]; payers: ExpensePayer[] };

export type Settlement = {
  from: Member;
  to: Member;
  amount_cents: number;
};

export type GroupWithDetails = Group & {
  members: Member[];
  expenses: Expense[];
  totalExpensesCents: number;
};

export type GroupSummary = Group & {
  members: Member[];
  totalExpensesCents: number;
};

export type SettlementRecord = {
  id: number;
  group_id: number;
  from_member_id: number;
  to_member_id: number;
  amount_cents: number;
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

export type { SplitMode, SplitInput } from "./splits";
export type { PayerInput } from "./payers";
