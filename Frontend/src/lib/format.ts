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
