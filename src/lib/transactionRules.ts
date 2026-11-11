import { isDate } from './dates';
import type { Account, Category } from '@/hooks/useFinanceData';
export const categoryCode = (c?: Category) => c?.system_code ?? ({'Préstamos / Deudas':'loan_given','Deudas Cobradas':'loan_repayment','Deuda Condonada':'debt_settled'}[c?.name ?? ''] ?? null);
export function validateMovement(t: any, accounts: Account[], categories: Category[]): string[] {
  const errors: string[] = [];
  if (!isDate(t.tx_date)) errors.push('Fecha inválida');
  if (!['expense','income','transfer'].includes(t.tx_type)) errors.push('Tipo de movimiento requerido');
  const pen = Number(t.amount_pen ?? 0), usd = Number(t.amount_usd ?? 0);
  if (![pen,usd].every(x => Number.isFinite(x) && x >= 0 && Math.abs(x * 100 - Math.round(x * 100)) < 0.001) || pen + usd <= 0) errors.push('Ingresa un importe positivo de hasta dos decimales');
  if (pen > 0 && usd > 0) errors.push('Un movimiento nuevo debe tener una sola moneda de origen');
  if (t.currency === 'USD' ? pen !== 0 : usd !== 0) errors.push('El importe no corresponde a la moneda');
  const byId = (id: string) => accounts.find(a => a.id === id);
  const cat = categories.find(c => c.id === t.category_id);
  if (t.category_id && (!cat || cat.tx_type !== t.tx_type)) errors.push('Categoría incompatible');
  if (t.tx_type === 'transfer') {
    const a = byId(t.origin_account_id), b = byId(t.destination_account_id);
    if (!a || !b) errors.push('Selecciona cuenta de origen y destino');
    else {
      if (a.id === b.id) errors.push('Origen y destino deben ser distintos');
      if (a.currency !== t.currency) errors.push('La moneda debe coincidir con la cuenta de origen');
      if (a.currency !== b.currency && (!(Number(t.destination_amount) > 0) || t.destination_currency !== b.currency)) errors.push('Indica el importe recibido y su moneda');
    }
  } else {
    const code = categoryCode(cat);
    if (!t.payment_account_id) {
      if (!t.person_id || !((t.tx_type === 'expense' && code === 'loan_given') || (t.tx_type === 'income' && code === 'debt_settled'))) errors.push('Falta la cuenta de pago');
    } else {
      const a = byId(t.payment_account_id);
      if (!a || a.currency !== t.currency) errors.push('Cuenta de pago y moneda incompatibles');
      if (code === 'debt_settled') errors.push('Una condonación no ingresa dinero a cuentas');
    }
    if (code && !t.person_id) errors.push('Selecciona la persona de la deuda');
  }
  return errors;
}
