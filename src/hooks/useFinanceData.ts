import { collectPages } from "@/lib/pagination";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type Account = {
  id: string;
  name: string;
  account_type: "debit" | "credit" | "cash" | "dollars" | "other";
  currency: "PEN" | "USD";
  counts_as_real_money: boolean;
  initial_balance: number;
  is_active: boolean;
  display_order: number;
  billing_start_day?: number | null;
  billing_end_day?: number | null;
  hidden_in_accounts?: boolean;
};

export type Category = {
  id: string;
  name: string;
  tx_type: "expense" | "income" | "transfer";
  is_active: boolean;
  system_code?: string | null;
};

export type Person = { id: string; name: string };

export type Transaction = {
  id: string;
  tx_date: string;
  tx_type: "expense" | "income" | "transfer";
  payment_account_id: string | null;
  origin_account_id: string | null;
  destination_account_id: string | null;
  person_id: string | null;
  category_id: string | null;
  description: string | null;
  amount_pen: number;
  amount_usd: number;
  currency: "PEN" | "USD";
  created_at: string;
  day_order?: number | null;
  destination_amount?: number | null;
  destination_currency?: "PEN" | "USD" | null;
};

function useOwnerId() {
  const { user } = useAuth();
  return user?.id ?? null;
}

function financeQuery<T>(table: string, ownerId: string | null, order: string) {
  return { queryKey: [table,ownerId], enabled: !!ownerId, queryFn: () => collectPages<T>((from,to) => (supabase as any).from(table).select('*').order(order).order('id').range(from,to)) };
}
export const useAccounts = () => useQuery(financeQuery<Account>('accounts',useOwnerId(),'display_order'));
export const useCategories = () => useQuery(financeQuery<Category>('categories',useOwnerId(),'name'));
export const usePeople = () => useQuery(financeQuery<Person>('people',useOwnerId(),'name'));
export const useMonthlyClosings = () => useQuery(financeQuery<any>('monthly_closings',useOwnerId(),'year'));
export const useBudgets = () => useQuery(financeQuery<any>('budgets',useOwnerId(),'year'));
export const useTransactions = () => {
  const ownerId = useOwnerId();
  return useQuery({queryKey:['transactions',ownerId],enabled:!!ownerId,queryFn:() => collectPages<Transaction>((from,to) => supabase.from('transactions').select('*').order('tx_date',{ascending:false}).order('day_order',{ascending:true,nullsFirst:false}).order('created_at',{ascending:false}).order('id').range(from,to))});
};
