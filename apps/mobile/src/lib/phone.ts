/** Local entry (24 123 4567 / 024 123 4567) → E.164 without plus: 233241234567 */
export function toE164Ghana(input: string): string | null {
  const d = input.replace(/\D/g, '');
  if (d.startsWith('233') && d.length === 12) return d;
  if (d.startsWith('0') && d.length === 10) return '233' + d.slice(1);
  if (d.length === 9 && /^[2-5]/.test(d)) return '233' + d;
  return null;
}

/** 233241234567 → "+233 24 123 4567" */
export function prettyPhone(e164: string | null | undefined): string {
  if (!e164) return '';
  const d = e164.replace(/\D/g, '');
  const local = d.startsWith('233') ? d.slice(3) : d.replace(/^0/, '');
  return `+233 ${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5)}`.trim();
}

/** As-you-type grouping for the 9 local digits: "24 123 4567" */
export function groupLocal(digits: string): string {
  const d = digits.replace(/\D/g, '').replace(/^0/, '').slice(0, 9);
  return [d.slice(0, 2), d.slice(2, 5), d.slice(5)].filter(Boolean).join(' ');
}

export const initials = (name?: string | null) =>
  (name ?? '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '•';

export const firstNameInitial = (name?: string | null) => {
  const parts = (name ?? '').trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1]![0]}.` : parts[0] ?? '';
};
