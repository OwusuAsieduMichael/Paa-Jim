import type { Network } from '@/backend';

export const NETS: Array<{ id: Network; name: string; short: string; sub: string; mark: string; badge: string; fg: string }> = [
  { id: 'mtn', name: 'MTN MoMo', short: 'MTN', sub: 'Approve with your MoMo PIN', mark: 'MTN', badge: '#FFCC00', fg: '#1A1A1A' },
  { id: 'vod', name: 'Telecel Cash', short: 'Telecel', sub: 'You may get a one-time code by SMS', mark: 'TC', badge: '#1A1A1A', fg: '#FFFFFF' },
  { id: 'atl', name: 'AirtelTigo Money', short: 'AirtelTigo', sub: 'Approve with your PIN', mark: 'AT', badge: '#1F3C88', fg: '#FFFFFF' },
];

export const netInfo = (n: Network) => NETS.find((x) => x.id === n)!;

/** Best guess of the network from a Ghana number (prefix), so we can pre-select it. Numbers can be ported, so it's only a suggestion. */
export function guessNetwork(digits: string): Network | null {
  const local = digits.replace(/\D/g, '').replace(/^233/, '').replace(/^0/, '');
  const p = local.slice(0, 2);
  if (['24', '25', '53', '54', '55', '59'].includes(p)) return 'mtn';
  if (['20', '50'].includes(p)) return 'vod';
  if (['26', '27', '56', '57'].includes(p)) return 'atl';
  return null;
}
