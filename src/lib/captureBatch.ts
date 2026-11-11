import type { Account, Category, Person } from '@/hooks/useFinanceData';
import { limaDate } from './dates';
import { categoryCode, validateMovement } from './transactionRules';
import { normalize, parseCapture, voicePattern, type ParsedCapture, type VoiceAlias } from './voiceParser';

export type CaptureItem = ParsedCapture & { transcript: string };

const loanWords = /\b(?:prest[eé]|pr[eé]stamo (?:a|para)|le hice un presta(?:mo)?)(?![a-záéíóúñ])/i;
const sameAccount = /\b(?:esa|esta|la misma)\s+(?:tarjeta|trajeta|cuenta)\b/i;
const otherKind = /\b(?:invit[eé]|regal[eé]|me pag[oó]|me devolvi[oó]|sin cobrar)(?![a-záéíóúñ])/i;
const operation = /\b(?:gast[eé]|compr[eé]|recib[ií]|cobr[eé]|transfer[ií]|prest[eé])(?![a-záéíóúñ])/i;

function splitByRules(input: string, people: Person[]): string[] {
  const names = people.map(person => voicePattern(person.name)).filter(Boolean).sort((a, b) => b.length - a.length);
  const markers = names.length ? new RegExp(`\\bpara\\s+(?:${names.join('|')})(?=[\\s.,;!?]|$)`, 'gi') : null;
  const boundaries = new Set<number>();
  const personMarkers = markers ? [...input.matchAll(markers)] : [];
  for (const [index, match] of personMarkers.entries()) {
    const clause = input.slice(match.index + match[0].length, personMarkers[index + 1]?.index ?? input.length);
    if (!loanWords.test(clause) && !sameAccount.test(clause) && !operation.test(clause)
      && !/\b(?:soles?|sols|so|d[oó]lares?)\b/i.test(clause)) continue;
    if (match.index > 0 && !input.slice(0, match.index).trim().match(/^(?:gasto|entrada|pagu[eé]|le prest[eé])$/i)) boundaries.add(match.index);
  }
  for (const match of input.matchAll(/(?:[;\n!?]|\.(?=\s+[a-záéíóúñ])|\b(?:y tambi[eé]n|adem[aá]s|luego|y)\s+)\s*/gi)) {
    const start = match.index + match[0].length;
    if (input.slice(start).match(operation)?.index === 0) boundaries.add(start);
  }
  const parts: string[] = [];
  let from = 0;
  for (const end of [...boundaries, input.length].sort((a, b) => a - b)) {
    const part = input.slice(from, end).trim();
    if (!part) continue;
    // A prefix with neither a price nor an operation belongs to the next clause.
    if (!parts.length && end < input.length && !operation.test(part)
      && !/\b(?:\d|soles?|sols|so|d[oó]lares?)\b/i.test(part)) continue;
    parts.push(part);
    from = end;
  }
  return parts.length ? parts : [input.trim()];
}

export function validatedSegments(input: string, fragments: unknown): string[] {
  if (!Array.isArray(fragments) || fragments.length < 2 || fragments.length > 24) throw new Error('La IA no encontró una separación verificable.');
  let cursor = 0;
  const separators = /^[\s,.;:!?¿¡]*(?:(?:y)[\s,.;:!?¿¡]+)*$/i;
  const segments = fragments.map(fragment => {
    if (typeof fragment !== 'string' || !fragment.trim()) throw new Error('La IA devolvió un fragmento inválido.');
    const excerpt = fragment.trim();
    const index = input.indexOf(excerpt, cursor);
    if (index < 0 || !separators.test(input.slice(cursor, index))) throw new Error('La IA cambió u omitió parte del dictado.');
    cursor = index + excerpt.length;
    return excerpt;
  });
  if (!separators.test(input.slice(cursor))) throw new Error('La IA omitió el final del dictado.');
  return segments;
}

export function planCapture(
  input: string, accounts: Account[], categories: Category[], people: Person[],
  aliases: VoiceAlias[], segments?: string[],
): CaptureItem[] {
  const parts = segments ?? splitByRules(input, people);
  const today = limaDate();
  const planned: CaptureItem[] = [];
  for (const [index, transcript] of parts.entries()) {
    const parsed = parseCapture(transcript, accounts, categories, people, today, aliases);
    const item: CaptureItem = { ...parsed, transcript };
    if (parts.length === 1) return [item];

    const prior = planned[planned.length - 1];
    const current = item.payload;
    const explicitLoan = loanWords.test(transcript);
    const priorLoan = categories.some(category => category.id === prior?.payload.category_id && categoryCode(category) === 'loan_given');
    const inferredLoan = !!current.person_id && priorLoan && sameAccount.test(transcript)
      && /\btambi[eé]n\b/i.test(transcript) && !otherKind.test(transcript);
    if (explicitLoan || inferredLoan) {
      const matches = categories.filter(category => category.is_active && category.tx_type === 'expense' && categoryCode(category) === 'loan_given');
      current.tx_type = 'expense';
      current.category_id = matches.length === 1 ? matches[0].id : null;
      item.categoryChoices = matches.map(category => category.id);
      if (inferredLoan && !explicitLoan) item.issues.push('Confirma que fue un préstamo');
      if (!current.person_id) item.issues.push('Confirma a quién le prestaste');
    }
    if (index > 0 && sameAccount.test(transcript)) {
      const previousAccount = accounts.find(account => account.id === prior?.payload.payment_account_id);
      if (previousAccount && previousAccount.currency === current.currency && current.tx_type !== 'transfer') {
        current.payment_account_id = previousAccount.id;
        item.accountChoices = [previousAccount.id];
      } else if (current.tx_type !== 'transfer') {
        current.payment_account_id = null;
        item.accountChoices = [];
      }
    }
    if (current.tx_type === 'expense' && !otherKind.test(transcript) && /\bcine\b/i.test(input)
      && (/\bentrada\b/i.test(transcript) || (inferredLoan && prior?.payload.description === 'Entrada al cine'))) {
      current.description = 'Entrada al cine';
    }
    // A missing price stays empty even when the same card or ticket is mentioned.
    if (!(current.amount_pen > 0 || current.amount_usd > 0)) item.issues.push('Indica el importe de este movimiento');
    if (!current.category_id && current.tx_type !== 'transfer') item.issues.push('Selecciona o confirma la categoría');
    if (!current.payment_account_id && current.tx_type !== 'transfer') item.issues.push('Cuenta omitida o ambigua');
    if (!current.description) current.description = normalize(transcript).includes('prest') ? 'Préstamo' : '';
    if (current.category_id) item.issues = item.issues.filter(issue => issue !== 'Selecciona o confirma la categoría');
    if (current.payment_account_id) item.issues = item.issues.filter(issue => !['Cuenta omitida o ambigua', 'Falta la cuenta de pago'].includes(issue));
    const validation = validateMovement(current, accounts, categories).filter(issue =>
      issue !== 'Ingresa un importe positivo de hasta dos decimales' || current.amount_pen > 0 || current.amount_usd > 0,
    );
    item.issues = [...new Set([...item.issues, ...validation])];
    item.autoPost = false;
    planned.push(item);
  }
  return planned;
}
