import { createContext, useCallback, useContext, useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Info, Inbox, Loader2, X, XCircle } from 'lucide-react';
import { initials } from '@/lib/format';

/* ---------------- Buttons ---------------- */
type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'gold' | 'outline';
const btnStyles: Record<BtnVariant, string> = {
  primary: 'bg-brand-700 text-white hover:bg-brand-800 shadow-sm shadow-brand-900/10',
  gold: 'bg-gold-500 text-white hover:bg-gold-600 shadow-sm',
  secondary: 'bg-brand-50 text-brand-800 hover:bg-brand-100',
  outline: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
  ghost: 'text-slate-600 hover:bg-slate-100',
  danger: 'bg-red-600 text-white hover:bg-red-700',
};
export function Button({
  variant = 'primary', size = 'md', loading, icon, className, children, disabled, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md' | 'lg'; loading?: boolean; icon?: ReactNode }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 disabled:cursor-not-allowed disabled:opacity-60',
        size === 'sm' && 'px-3 py-1.5 text-xs',
        size === 'md' && 'px-4 py-2.5 text-sm',
        size === 'lg' && 'px-5 py-3 text-base',
        btnStyles[variant],
        className,
      )}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

/* ---------------- Form fields ---------------- */
export function Field({ label, error, hint, children, className }: { label?: ReactNode; error?: string | null; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      {label && <label className="label">{label}</label>}
      {children}
      {error ? <p className="mt-1 text-xs font-medium text-red-600">{error}</p> : hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}
export const Input = ({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={clsx('input', className)} />;
export const Textarea = ({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={clsx('input min-h-[96px]', className)} />;
export function Select({ className, options, placeholder, ...p }: SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[]; placeholder?: string }) {
  return (
    <select {...p} className={clsx('input pr-8', className)}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

/* ---------------- Layout pieces ---------------- */
export function PageHeader({ title, subtitle, actions, icon }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex items-center gap-3">
        {icon && <div className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-100 text-brand-700">{icon}</div>}
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, subtitle, actions, children, className, bodyClass, noPad }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClass?: string; noPad?: boolean }) {
  return (
    <section className={clsx('card', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            {title && <h2 className="text-[15px] font-bold text-slate-900">{title}</h2>}
            {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className={clsx(!noPad && 'p-5', bodyClass)}>{children}</div>
    </section>
  );
}

type Tone = 'green' | 'gold' | 'plum' | 'blue' | 'slate' | 'red';
const toneBg: Record<Tone, string> = {
  green: 'bg-brand-50 text-brand-700', gold: 'bg-gold-50 text-gold-700', plum: 'bg-violet-50 text-violet-700',
  blue: 'bg-sky-50 text-sky-700', slate: 'bg-slate-100 text-slate-600', red: 'bg-red-50 text-red-700',
};
export function StatCard({ label, value, sub, icon, tone = 'green', onClick }: { label: ReactNode; value: ReactNode; sub?: ReactNode; icon?: ReactNode; tone?: Tone; onClick?: () => void }) {
  return (
    <div onClick={onClick} className={clsx('card flex items-start gap-4 p-5', onClick && 'cursor-pointer transition hover:-translate-y-0.5 hover:shadow-md')}>
      {icon && <div className={clsx('grid h-11 w-11 shrink-0 place-items-center rounded-xl', toneBg[tone])}>{icon}</div>}
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-slate-500">{label}</p>
        <p className="mt-1 truncate text-2xl font-bold tracking-tight text-slate-900">{value}</p>
        {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
      </div>
    </div>
  );
}

/* ---------------- Badges ---------------- */
const statusTone: Record<string, string> = {
  ACTIVE: 'bg-brand-50 text-brand-700 ring-brand-200', APPROVED: 'bg-brand-50 text-brand-700 ring-brand-200', PAID: 'bg-brand-50 text-brand-700 ring-brand-200',
  INVOICED: 'bg-brand-50 text-brand-700 ring-brand-200', DELIVERED: 'bg-brand-50 text-brand-700 ring-brand-200', POSTED: 'bg-brand-50 text-brand-700 ring-brand-200',
  RESOLVED: 'bg-brand-50 text-brand-700 ring-brand-200', COMPLETED: 'bg-brand-50 text-brand-700 ring-brand-200', SUCCESS: 'bg-brand-50 text-brand-700 ring-brand-200',
  REFUNDED: 'bg-sky-50 text-sky-700 ring-sky-200', CREDIT: 'bg-brand-50 text-brand-700 ring-brand-200',
  PENDING: 'bg-amber-50 text-amber-800 ring-amber-200', REQUESTED: 'bg-amber-50 text-amber-800 ring-amber-200', PENDING_PAYMENT: 'bg-amber-50 text-amber-800 ring-amber-200',
  REGISTERED: 'bg-amber-50 text-amber-800 ring-amber-200', PREVIEWED: 'bg-amber-50 text-amber-800 ring-amber-200', OPEN: 'bg-amber-50 text-amber-800 ring-amber-200',
  IN_PROGRESS: 'bg-sky-50 text-sky-700 ring-sky-200', SHIPPED: 'bg-sky-50 text-sky-700 ring-sky-200', CONFIRMED: 'bg-sky-50 text-sky-700 ring-sky-200',
  ESCALATED: 'bg-orange-50 text-orange-700 ring-orange-200', DEBIT: 'bg-slate-100 text-slate-700 ring-slate-200',
  REJECTED: 'bg-red-50 text-red-700 ring-red-200', BLOCKED: 'bg-red-50 text-red-700 ring-red-200', CANCELLED: 'bg-red-50 text-red-700 ring-red-200',
  TERMINATED: 'bg-red-50 text-red-700 ring-red-200', FAILED: 'bg-red-50 text-red-700 ring-red-200', RETURNED: 'bg-red-50 text-red-700 ring-red-200',
  FULL: 'bg-violet-50 text-violet-700 ring-violet-200', BASIC: 'bg-sky-50 text-sky-700 ring-sky-200', NONE: 'bg-slate-100 text-slate-600 ring-slate-200',
  NOT_SUBMITTED: 'bg-slate-100 text-slate-600 ring-slate-200', CLOSED: 'bg-slate-100 text-slate-600 ring-slate-200', APPROVED_CLOSING: 'bg-sky-50 text-sky-700 ring-sky-200',
};
const statusText: Record<string, string> = { FULL: '100 BV', BASIC: '40 BV', NONE: 'Inactive', PENDING_PAYMENT: 'Awaiting payment', NOT_SUBMITTED: 'Not submitted' };
export function Badge({ children, status, className }: { children?: ReactNode; status?: string | null; className?: string }) {
  const s = status ?? '';
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset', statusTone[s] ?? 'bg-slate-100 text-slate-700 ring-slate-200', className)}>
      {children ?? statusText[s] ?? s.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}
    </span>
  );
}

export function Avatar({ name, size = 36, className }: { name?: string | null; size?: number; className?: string }) {
  return (
    <div style={{ width: size, height: size, fontSize: size * 0.38 }} className={clsx('grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-600 to-brand-800 font-bold text-white', className)}>
      {initials(name)}
    </div>
  );
}

export function Progress({ value, tone = 'green', label }: { value: number; tone?: 'green' | 'gold' | 'plum'; label?: string }) {
  return (
    <div>
      {label && <div className="mb-1 flex justify-between text-xs text-slate-500"><span>{label}</span><span className="font-semibold text-slate-700">{value.toFixed(0)}%</span></div>}
      <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
        <div className={clsx('h-full rounded-full transition-all', tone === 'green' && 'bg-brand-600', tone === 'gold' && 'bg-gold-500', tone === 'plum' && 'bg-violet-600')} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </div>
    </div>
  );
}

export function Callout({ tone = 'info', title, children }: { tone?: 'info' | 'warn' | 'danger' | 'success'; title?: ReactNode; children?: ReactNode }) {
  const map = {
    info: ['border-sky-200 bg-sky-50 text-sky-900', <Info key="i" className="h-5 w-5 text-sky-600" />],
    warn: ['border-amber-200 bg-amber-50 text-amber-900', <AlertTriangle key="w" className="h-5 w-5 text-amber-600" />],
    danger: ['border-red-200 bg-red-50 text-red-900', <XCircle key="d" className="h-5 w-5 text-red-600" />],
    success: ['border-brand-200 bg-brand-50 text-brand-900', <CheckCircle2 key="s" className="h-5 w-5 text-brand-600" />],
  } as const;
  return (
    <div className={clsx('flex gap-3 rounded-xl border p-4 text-sm', map[tone][0])}>
      <div className="shrink-0">{map[tone][1]}</div>
      <div>{title && <p className="font-semibold">{title}</p>}{children && <div className={clsx(title && 'mt-0.5', 'opacity-90')}>{children}</div>}</div>
    </div>
  );
}

/* ---------------- Tabs ---------------- */
export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { value: T; label: ReactNode; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="scrollbar-thin mb-4 flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
      {tabs.map((t) => (
        <button key={t.value} onClick={() => onChange(t.value)}
          className={clsx('flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition', value === t.value ? 'bg-white text-brand-800 shadow-sm' : 'text-slate-500 hover:text-slate-800')}>
          {t.label}
          {t.count !== undefined && <span className="rounded-full bg-slate-200 px-1.5 text-[11px] text-slate-600">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ---------------- Table ---------------- */
export interface Column<T> {
  key: string;
  header: ReactNode;
  render?: (row: T) => ReactNode;
  align?: 'left' | 'right' | 'center';
  className?: string;
}
export function DataTable<T extends { id?: string | number }>({ columns, rows, loading, empty = 'Nothing to show yet', onRowClick, footer }: { columns: Column<T>[]; rows?: T[]; loading?: boolean; empty?: ReactNode; onRowClick?: (r: T) => void; footer?: ReactNode }) {
  return (
    <div className="scrollbar-thin overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-100">
        <thead className="bg-slate-50/70">
          <tr>{columns.map((c) => <th key={c.key} className={clsx('th', c.align === 'right' && 'text-right', c.align === 'center' && 'text-center')}>{c.header}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {loading && !rows?.length
            ? Array.from({ length: 4 }).map((_, i) => (
                <tr key={i}>{columns.map((c) => <td key={c.key} className="td"><div className="h-4 w-3/4 animate-pulse rounded bg-slate-100" /></td>)}</tr>
              ))
            : rows?.map((r, i) => (
                <tr key={(r.id as string) ?? i} onClick={onRowClick ? () => onRowClick(r) : undefined} className={clsx('transition', onRowClick && 'cursor-pointer hover:bg-brand-50/40')}>
                  {columns.map((c) => (
                    <td key={c.key} className={clsx('td', c.align === 'right' && 'text-right tabular-nums', c.align === 'center' && 'text-center', c.className)}>
                      {c.render ? c.render(r) : String((r as Record<string, unknown>)[c.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
        </tbody>
        {footer}
      </table>
      {!loading && !rows?.length && <EmptyState title={empty} />}
    </div>
  );
}

export function Pagination({ page, pageSize, total, onChange }: { page: number; pageSize: number; total: number; onChange: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return total ? <p className="px-5 py-3 text-xs text-slate-500">{total} record{total === 1 ? '' : 's'}</p> : null;
  return (
    <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-sm">
      <span className="text-xs text-slate-500">Showing {(page - 1) * pageSize + 1}–{Math.min(total, page * pageSize)} of {total}</span>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onChange(page - 1)} icon={<ChevronLeft className="h-4 w-4" />} aria-label="Previous page" />
        <span className="px-2 text-xs font-semibold text-slate-600">{page} / {pages}</span>
        <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => onChange(page + 1)} icon={<ChevronRight className="h-4 w-4" />} aria-label="Next page" />
      </div>
    </div>
  );
}

export function EmptyState({ title, children, icon }: { title: ReactNode; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400">{icon ?? <Inbox className="h-6 w-6" />}</div>
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      {children && <div className="mt-1 text-sm text-slate-500">{children}</div>}
    </div>
  );
}

export const Spinner = ({ className }: { className?: string }) => <Loader2 className={clsx('h-5 w-5 animate-spin text-brand-600', className)} />;
export const PageLoader = () => <div className="grid min-h-[40vh] place-items-center"><Spinner className="h-8 w-8" /></div>;

export function KeyValue({ items, cols = 2 }: { items: [ReactNode, ReactNode][]; cols?: 1 | 2 | 3 }) {
  return (
    <dl className={clsx('grid gap-x-6 gap-y-4', cols === 2 && 'sm:grid-cols-2', cols === 3 && 'sm:grid-cols-3')}>
      {items.map(([k, v], i) => (
        <div key={i}>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{k}</dt>
          <dd className="mt-1 text-sm font-semibold text-slate-800">{v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ---------------- Modal ---------------- */
export function Modal({ open, onClose, title, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={onClose}>
      <div onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true"
        className={clsx('animate-fade-in flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl',
          size === 'sm' && 'sm:max-w-md', size === 'md' && 'sm:max-w-lg', size === 'lg' && 'sm:max-w-2xl', size === 'xl' && 'sm:max-w-4xl')}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="text-base font-bold text-slate-900">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------------- Toasts ---------------- */
type ToastT = { id: number; tone: 'success' | 'error' | 'info'; text: string };
const ToastCtx = createContext<{ success: (t: string) => void; error: (t: string) => void; info: (t: string) => void }>({ success: () => {}, error: () => {}, info: () => {} });
export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<ToastT[]>([]);
  const push = useCallback((tone: ToastT['tone'], text: string) => {
    const id = Date.now() + Math.random();
    setList((l) => [...l, { id, tone, text }]);
    setTimeout(() => setList((l) => l.filter((x) => x.id !== id)), 4500);
  }, []);
  return (
    <ToastCtx.Provider value={{ success: (t) => push('success', t), error: (t) => push('error', t), info: (t) => push('info', t) }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-4 sm:items-end">
        {list.map((t) => (
          <div key={t.id} role="status" className={clsx('animate-fade-in pointer-events-auto flex max-w-sm items-start gap-2 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg',
            t.tone === 'success' && 'bg-brand-800', t.tone === 'error' && 'bg-red-700', t.tone === 'info' && 'bg-slate-800')}>
            {t.tone === 'success' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : t.tone === 'error' ? <XCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <Info className="mt-0.5 h-4 w-4 shrink-0" />}
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);
