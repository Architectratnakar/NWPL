import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, KeyRound, LogIn, UserRound } from 'lucide-react';
import { useAuth, STAFF_ROLES } from '@/auth/AuthContext';
import { errMsg } from '@/api/client';
import { useT } from '@/i18n';
import { Button, Callout, Field, Input } from '@/components/ui';
import AuthShell from './AuthShell';

export const DEMO_LOGINS = [
  { label: 'Distributor', who: 'Ramesh Kumar · NW100001', login: 'NW100001', password: 'Demo@123', tone: 'bg-brand-50 text-brand-800 ring-brand-200' },
  { label: 'New member', who: 'Not yet activated · NW100040', login: 'NW100040', password: 'Demo@123', tone: 'bg-sky-50 text-sky-800 ring-sky-200' },
  { label: 'Super Admin', who: 'admin@navarth.demo', login: 'admin@navarth.demo', password: 'Admin@123', tone: 'bg-violet-50 text-violet-800 ring-violet-200' },
  { label: 'Finance', who: 'finance@navarth.demo', login: 'finance@navarth.demo', password: 'Finance@123', tone: 'bg-gold-50 text-gold-700 ring-gold-100' },
  { label: 'Operations', who: 'ops@navarth.demo', login: 'ops@navarth.demo', password: 'Ops@123', tone: 'bg-slate-50 text-slate-700 ring-slate-200' },
  { label: 'Support', who: 'support@navarth.demo', login: 'support@navarth.demo', password: 'Support@123', tone: 'bg-slate-50 text-slate-700 ring-slate-200' },
];

export default function Login() {
  const { login } = useAuth();
  const { t } = useT();
  const nav = useNavigate();
  const [form, setForm] = useState({ login: '', password: '' });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const u = await login(form.login.trim(), form.password);
      nav(STAFF_ROLES.includes(u.role) ? '/admin' : '/app', { replace: true });
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <div className="mb-8">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-gold-50 px-3 py-1 text-xs font-semibold text-gold-700 ring-1 ring-gold-100"><KeyRound className="h-3.5 w-3.5" /> Secure sign in</div>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">{t('welcome')}</h1>
        <p className="mt-1.5 text-sm text-slate-500">{t('loginSub')}</p>
      </div>

      <form onSubmit={submit} className="space-y-4">
        {error && <Callout tone="danger" title={error} />}
        <Field label={t('userId')}>
          <div className="relative">
            <UserRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input autoFocus autoComplete="username" required value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} placeholder="NW100001 or 98xxxxxxxx" className="pl-10" />
          </div>
        </Field>
        <Field label={<span className="flex justify-between"><span>{t('password')}</span><Link to="/forgot-password" className="link text-xs">{t('forgot')}</Link></span>}>
          <div className="relative">
            <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input type={show ? 'text' : 'password'} autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="••••••••" className="px-10" />
            <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700" aria-label={show ? 'Hide password' : 'Show password'}>
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>
        <Button type="submit" size="lg" loading={busy} className="w-full" icon={<LogIn className="h-4 w-4" />}>{t('login')}</Button>
      </form>

      <p className="mt-5 text-center text-sm text-slate-500">{t('noAccount')} <Link to="/register" className="link">{t('register')}</Link></p>

      <div className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-4">
        <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">{t('demo')}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {DEMO_LOGINS.map((d) => (
            <button key={d.login} type="button" onClick={() => setForm({ login: d.login, password: d.password })}
              className={`rounded-xl px-3 py-2 text-left ring-1 ring-inset transition hover:-translate-y-0.5 hover:shadow-sm ${d.tone}`}>
              <p className="text-xs font-bold">{d.label}</p>
              <p className="truncate text-[11px] opacity-80">{d.who}</p>
              <p className="font-mono text-[11px] opacity-70">{d.password}</p>
            </button>
          ))}
        </div>
      </div>
    </AuthShell>
  );
}
