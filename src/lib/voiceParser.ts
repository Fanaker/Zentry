import type { Account, Category, Person } from '@/hooks/useFinanceData';
import { limaDate, shiftDate } from './dates';
import { categoryCode, validateMovement } from './transactionRules';

export const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9.,]+/g, ' ')
  .replace(/\bb[. ]+c[. ]+p\b/g, 'bcp').replace(/\bk[. ]+f[. ]+c\b/g, 'kfc').trim();
const words = (value: string) => normalize(value).replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();
const mentions = (text: string, phrase: string) => !!words(phrase) && ` ${words(text)} `.includes(` ${words(phrase)} `);

const smallNumbers = [
  'cero','un','dos','tres','cuatro','cinco','seis','siete','ocho','nueve','diez',
  'once','doce','trece','catorce','quince','dieciseis','diecisiete','dieciocho','diecinueve',
  'veinte','veintiun','veintidos','veintitres','veinticuatro','veinticinco','veintiseis',
  'veintisiete','veintiocho','veintinueve',
];
const tens = ['treinta','cuarenta','cincuenta','sesenta','setenta','ochenta','noventa'];

const spokenNumber = [...smallNumbers, ...tens, 'cien', 'una', 'uno', 'veintiuno'].join('|');
const ones = smallNumbers.slice(1, 10).join('|');
const unit = 'soles?|sols|so|dolares?|usd|pen';

function spokenAmounts(text: string): number[] {
  const pattern = new RegExp(`\\b(${spokenNumber})(?: y (${ones}))? (?:${unit})\\b`, 'g');
  return [...text.matchAll(pattern)].flatMap(match => {
    const [, first, last] = match;
    if (tens.includes(first)) return [30 + 10 * tens.indexOf(first) + (last ? smallNumbers.indexOf(last) : 0)];
    if (last) return [];
    if (first === 'cien') return [100];
    if (first === 'uno' || first === 'una') return [1];
    if (first === 'veintiuno') return [21];
    return [smallNumbers.indexOf(first)];
  });
}

export function voicePattern(phrase: string): string {
  const letters: Record<string, string> = {a:'[aá]',e:'[eé]',i:'[ií]',o:'[oó]',u:'[uúü]',n:'[nñ]'};
  return [...normalize(phrase)].map(char => letters[char] ?? (char === ' ' ? '\\s+' : /[.,]/.test(char) ? '\\' + char : char)).join('');
}

export function normalizeSpokenMoney(text: string): string {
  const cents = 'diez|veinte|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa';
  return text.replace(new RegExp(`\\b(un|uno|una|\\d+)\\s+sol(?:es)?\\s+(\\d{2}|${cents})(?![a-z0-9.,])`, 'gi'), (_, whole: string, fraction: string) => {
    const value = /^\d+$/.test(whole) ? whole : '1';
    const digits = /^\d+$/.test(fraction) ? fraction : String((cents.split('|').indexOf(fraction.toLowerCase()) + 1) * 10);
    return `${value}.${digits} soles`;
  });
}

export function captureDescription(text: string): string {
  const spellings = spokenNumber.split('|').map(voicePattern).join('|');
  const money = `(?:\\d+(?:[.,]\\d+)?|(?:${spellings})(?:\\s+y\\s+(?:${ones}))?)\\s+(?:soles?|sols|so|d[oó]lares?|usd|pen)\\b`;
  const cleaned = normalizeSpokenMoney(text).trim()
    .replace(/[,;\s]+(?:y|luego|adem[aá]s)[,;\s]*$/i, '')
    .replace(/^hola[\s,.¡!]+/i, '')
    .replace(/\(\s*categor[ií]a[^)]*\)/gi, '')
    .replace(/(?:[,\s]+)(?:(?:y\s+)?(?:tambi[eé]n\s+)?(?:lo\s+)?pagu[eé](?:n)?\s+con\s+[^,;!?]+|con\s+(?:yape|plin|efectivo))[\s.,;!?]*$/i, '')
    .replace(new RegExp(`^(?:(?:hoy|ayer|anteayer)\\s+)?(?:acabo de\\s+)?(?:gast[eé]|gastar|pagu[eé]|compr[eé]|pagar)\\s+${money}\\s+(?:en|por)\\s+`, 'i'), '')
    .replace(new RegExp(`[,\\s]+(?:por\\s+|de\\s+)?${money}[\\s.,;!?]*$`, 'i'), '')
    .replace(/^(?:(?:hoy|ayer|anteayer)\s+)?(?:compr[eé]|gast[eé])\s+(?:en\s+)?/i, '')
    .replace(new RegExp(`^(?:(?:registra\\s+)?un\\s+gasto\\s+de\\s+)?${money}\\s+(?:con|a mi)\\s+(?:mi\\s+)?(?:tarjeta\\s+.+?|metro(?:politano)?\\s+(?:uni|universitario))\\s+por\\s+`, 'i'), '')
    .replace(/^[\s,;:]+|[\s,;:]+$/g, '');
  return cleaned.slice(0, 500);
}

export type VoiceAlias = { phrase: string; field: 'account' | 'category'; id: string };
export type ParsedCapture = { payload: any; issues: string[]; autoPost: boolean; accountChoices: string[]; categoryChoices: string[] };
export function parseCapture(text: string, accounts: Account[], categories: Category[], people: Person[], today = limaDate(), aliases: VoiceAlias[] = []): ParsedCapture {
  const s = normalize(normalizeSpokenMoney(text)).replace(/\btrajeta\b/g, 'tarjeta');
  const issues: string[] = [];
  const has = (pattern: RegExp) => pattern.test(s);
  const transfer = has(/\b(transferi|traspase|transferencia|pase.*(?:a mi|entre cuentas)|pague\s+(?:(?:la|mi|el)\s+)?(?:deuda de (?:la |mi )?)?tarjeta)\b/);
  const special = has(/\b(condone|perdone)\b/) ? 'debt_settled' : has(/\b(preste|prestamo (?:a|para)|le hice un presta(?:mo)?)\b/) ? 'loan_given' : has(/\b(me pago|me devolvio)\b/) ? 'loan_repayment' : null;
  const type = transfer ? 'transfer' : special === 'debt_settled' || has(/\b(recibi|ingreso|cobre|me pago|me devolvio)\b/) ? 'income' : 'expense';

  const numericAmounts = [...s.matchAll(/\b\d+(?:[.,]\d{1,2})?\b/g)].map(match => Number(match[0].replace(',', '.')));
  const amounts = [...numericAmounts, ...spokenAmounts(s)];
  const amount = amounts.length === 1 ? amounts[0] : 0;
  if (!amounts.length) issues.push('Indica el importe de este movimiento');
  if (amounts.length > 1) issues.push('Indica un único importe; varios importes requieren revisión');
  if (!special && !has(/\b(gaste|gastar|gasto|pague|compre|recibi|cobre|transferi|pase|traspase|preste|condone|perdone)\b/)) issues.push('Confirma qué operación realizaste');
  if (has(/\b(no|nunca|todavia|pendiente|anulado|cancelado|reembolso|devolucion|debo|debe|fiado)\b/)) issues.push('La frase contiene negación, deuda o un ajuste por revisar');
  if (has(/\b(creo|quizas|aproximadamente|o tal vez|manana|lunes|martes|miercoles|jueves|viernes|sabado|domingo|el dia)\b/)) issues.push('Confirma la fecha o los datos inciertos');
  const dollar = has(/\b(dolares|dolar|usd)\b/);
  const truncatedSol = has(/\b(?:so|sols)\b/) && (spokenAmounts(s).length > 0 || has(/\b\d+(?:[.,]\d{1,2})?\s+(?:so|sols)\b/));
  const sol = has(/\b(soles|sol|pen)\b/) || truncatedSol;
  if (truncatedSol) issues.push('Confirma soles: la transcripción de la moneda quedó incompleta');
  const currency = dollar && !sol ? 'USD' : 'PEN';
  if (dollar === sol) issues.push('Confirma la moneda');
  if (/(?:^|\s)-\s*\d/.test(text) || has(/\b(menos|negativo|centimos|centavos)\b/)
    || (!numericAmounts.length && has(/\b(mil|millon|millones|ciento|doscientos|trescientos|cuatrocientos|quinientos|seiscientos|setecientos|ochocientos|novecientos)\b/))) issues.push('Confirma el importe exacto');

  const eligible = accounts.filter(account => account.is_active && account.currency === currency);
  const aliased = eligible.filter(account => aliases.some(alias => alias.field === 'account' && alias.id === account.id && mentions(s, alias.phrase)));
  const card = has(/\b(tarjeta|credito|debito)\b/);
  const credit = has(/\bcredito\b/), debit = has(/\bdebito\b/);
  const named = eligible.filter(account => mentions(s, account.name)
    && (!credit || account.account_type === 'credit') && (!debit || account.account_type === 'debit'));
  const banks = ['bcp', 'interbank', 'bbva', 'scotiabank', 'banbif', 'falabella'].filter(bank => mentions(s, bank));
  const inferred = eligible.filter(account => {
    if (mentions(s, 'yape')) return words(account.name) === 'bcp yape';
    if (mentions(s, 'efectivo')) return account.account_type === 'cash';
    if (banks.length && !banks.some(bank => mentions(account.name, bank))) return false;
    if (credit) return account.account_type === 'credit';
    if (debit) return account.account_type === 'debit' && !mentions(account.name, 'yape');
    if (card) return account.account_type === 'credit' || account.account_type === 'debit';
    return banks.length > 0 && account.account_type === 'debit' && !mentions(account.name, 'yape');
  });
  const metro = ['metropolitano universitario', 'metro uni', 'metro universitario'].some(phrase => mentions(s, phrase));
  const metroAccounts = eligible.filter(account => words(account.name) === 'metropolitano univ');
  const candidates = aliased.length ? aliased : metro ? metroAccounts : named.length ? named : inferred;
  const available = categories.filter(category => category.tx_type === type && category.is_active);
  const explicitCategory = available.filter(category => mentions(s, 'categoria ' + category.name));
  const namedCategories = available.filter(category => mentions(s, category.name));
  const aliasedCategories = available.filter(category => aliases.some(alias => alias.field === 'category' && alias.id === category.id && mentions(s, alias.phrase)));
  const semantic = mentions(s, 'pasaje a') && available.some(category=>words(category.name)==='movilidad') ? 'movilidad' : has(/\b(kfc|comida rapida)\b/) ? 'comida rapida' : has(/\b(almuerzo|comida|desayuno|cena|pan|menu)\b/) ? 'alimentacion' : has(/\b(taxi|pasaje|bus|uber|mototaxi|moto desde|moto hasta)\b/) ? 'transporte' : has(/\b(cine|pelicula)\b/) ? 'entretenimiento' : has(/\bsueldo\b/) ? 'sueldo' : '';
  const categoryCandidates = special ? available.filter(category => categoryCode(category) === special)
    : explicitCategory.length ? explicitCategory : namedCategories.length ? namedCategories : aliasedCategories.length ? aliasedCategories
      : available.filter(category => words(category.name) === semantic);
  const category = categoryCandidates.length === 1 ? categoryCandidates[0] : undefined;
  if (!category) issues.push('Selecciona o confirma la categoría');
  if (candidates.length !== 1 || transfer) issues.push(transfer ? 'Confirma origen, destino e importes de la transferencia' : 'Cuenta omitida o ambigua');
  if (special) issues.push('Revisa la operación de deuda antes de confirmarla');
  if (has(/\b(luego|tambien|ademas|y\s+(?:gaste|compre|recibi|transferi))\b/)) issues.push('Revisa si hay más de un movimiento');
  const personMatches = people.filter(person => mentions(s, person.name));
  const payload = {
    tx_date: has(/\banteayer\b/) ? shiftDate(today, -2) : has(/\bayer\b/) ? shiftDate(today, -1) : today,
    tx_type: type, currency, amount_pen: currency === 'PEN' ? amount : 0, amount_usd: currency === 'USD' ? amount : 0,
    payment_account_id: transfer || special === 'debt_settled' || candidates.length !== 1 ? null : candidates[0].id,
    origin_account_id: null, destination_account_id: null,
    category_id: category?.id ?? null, person_id: personMatches.length === 1 ? personMatches[0].id : null,
    description: captureDescription(text),
  };
  issues.push(...validateMovement(payload, accounts, categories));
  return {
    payload, issues: [...new Set(issues)], autoPost: issues.length === 0 && !special && !transfer,
    accountChoices: candidates.map(account => account.id), categoryChoices: categoryCandidates.map(category => category.id),
  };
}
