export const num = (v: unknown) => (v === null || v === undefined || v === '' ? 0 : Number(v));

export const inr = (v: unknown, decimals = 0) =>
  '₹' + num(v).toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals === 0 ? 2 : decimals });

export const compactInr = (v: unknown) => {
  const n = num(v);
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  return inr(n);
};

export const bv = (v: unknown) => num(v).toLocaleString('en-IN', { maximumFractionDigits: 2 });

export const date = (v?: string | Date | null) =>
  v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '—';

export const dateTime = (v?: string | Date | null) =>
  v ? new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '—';

export const titleCase = (s?: string | null) => (s ? s.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '—');

export const tierLabel = (t?: string | null) => (t === 'FULL' ? '100 BV' : t === 'BASIC' ? '40 BV' : 'Not active');

export const initials = (name?: string | null) =>
  (name ?? '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

/** Short note for a non-pair income line (rank name, autopool level …) */
export const incomeNote = (l: { incomeType: string; detail?: any }) =>
  l.incomeType === 'AUTOPOOL' && l.detail ? `Level ${l.detail.level} · position #${l.detail.position}` : l.detail?.rankName ?? '—';

/** Key/value rows explaining a non-pair income line */
export const incomeExplain = (l: { incomeType: string; amount: unknown; detail?: any }): [string, string][] =>
  l.incomeType === 'AUTOPOOL'
    ? [
        ['Type', 'Autopool (4 × 4 matrix)'],
        ['Pool position', `#${l.detail.position}`],
        ['Level completed', `Level ${l.detail.level} — ${Number(l.detail.filled).toLocaleString('en-IN')} of ${Number(l.detail.team).toLocaleString('en-IN')} positions filled`],
        ['Repurchase BV on own ID', `${l.detail.repurchaseBv} BV (needed ${l.detail.requiredBv} BV)`],
        ['Amount', inr(l.amount)],
      ]
    : [['Type', titleCase(l.incomeType)], ['Rank', l.detail?.rankName ?? '—'], ['Amount', inr(l.amount)], ['Reason', l.detail?.reason ?? `Weaker leg BV reached ${l.detail?.weakLegBv}`]];
