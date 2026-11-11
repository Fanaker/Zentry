import type { Account, Transaction } from '@/hooks/useFinanceData';
export const lastDayOfMonth = (year: number, month: number) => `${year}-${String(month).padStart(2,'0')}-${new Date(year,month,0).getDate()}`;
// One engine, two explicit views: reconciliation excludes the closing being checked;
// current balance may use a closing whose entire month has already ended.
export function computeBalanceUpTo(account: Account, txs: Transaction[], closings: any[], cutoffDate: string, includeCompletedClosing = false): {pen:number;usd:number} {
  const month = cutoffDate.slice(0,7);
  const last = closings.filter(c => c.account_id === account.id && (includeCompletedClosing ? lastDayOfMonth(c.year,c.month) <= cutoffDate : `${c.year}-${String(c.month).padStart(2,'0')}` < month)).sort((a,b) => b.year-a.year || b.month-a.month)[0];
  let pen = account.currency === 'PEN' ? Math.round(Number(account.initial_balance || 0)*100) : 0;
  let usd = account.currency === 'USD' ? Math.round(Number(account.initial_balance || 0)*100) : 0;
  const start = last ? lastDayOfMonth(last.year,last.month) : '0000-00-00';
  if (last) { pen = Math.round(Number(last.real_balance_pen)*100); usd = Math.round(Number(last.real_balance_usd)*100); }
  for (const t of txs) {
    if (t.tx_date <= start || t.tx_date > cutoffDate) continue;
    const apply = (sign: number, dest = false) => {
      if (dest && t.destination_amount != null) {
        if (t.destination_currency === 'USD') usd += sign*Math.round(Number(t.destination_amount)*100);
        else pen += sign*Math.round(Number(t.destination_amount)*100);
      } else { pen += sign*Math.round(Number(t.amount_pen || 0)*100); usd += sign*Math.round(Number(t.amount_usd || 0)*100); }
    };
    if (t.tx_type === 'income' && t.payment_account_id === account.id) apply(1);
    if (t.tx_type === 'expense' && t.payment_account_id === account.id) apply(-1);
    if (t.tx_type === 'transfer') {
      if (t.origin_account_id === account.id) apply(-1);
      if (t.destination_account_id === account.id) apply(1,true);
    }
  }
  return {pen:pen/100, usd:usd/100};
}
