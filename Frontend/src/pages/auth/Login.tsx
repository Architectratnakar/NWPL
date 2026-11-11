import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff, KeyRound, LogIn, MessageSquareLock, RotateCw, ShieldCheck, UserRound } from 'lucide-react';
import { homeFor, useAuth, type OtpChallenge } from '@/auth/AuthContext';
import { errMsg } from '@/api/client';
import { useT } from '@/i18n';
import { Button, Callout, Field, Input } from '@/components/ui';
import AuthShell from './AuthShell';

export const DEMO_LOGINS = [
  { label: 'Distributor', who: 'Ramesh Kumar · NW100001', login: 'NW100001', password: 'Demo@123', tone: 'bg-brand-50 text-brand-800 ring-brand-200' },
  { label: 'New member', who: 'Not yet activated · mobile 9123456789', login: '9123456789', password: 'Demo@123', tone: 'bg-sky-50 text-sky-800 ring-sky-200' },
  { label: 'Super Admin (OTP)', who: 'admin@navarth.demo', login: 'admin@navarth.demo', password: 'Admin@123', tone: 'bg-violet-50 text-violet-800 ring-violet-200' },
  { label: 'Franchise', who: 'Sunita Devi · NW100002 · FR0001', login: 'NW100002', password: 'Demo@123', tone: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  { label: 'Finance', who: 'finance@navarth.demo', login: 'finance@navarth.demo', password: 'Finance@123', tone: 'bg-gold-50 text-gold-700 ring-gold-100' },
  { label: 'Operations', who: 'ops@navarth.demo', login: 'ops@navarth.demo', password: 'Ops@123', tone: 'bg-slate-50 text-slate-700 ring-slate-200' },
  { label: 'Support', who: 'support@navarth.demo', login: 'support@navarth.demo', password: 'Support@123', tone: 'bg-slate-50 text-slate-700 ring-slate-200' },
];

/** Seconds left until `until` (ms timestamp), ticking every second */
function useCountdown(until: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return Math.max(0, Math.ceil((until - now) / 1000));
}

/** Super Admin step 2: 6-digit OTP sent by SMS */
function OtpStep({ challenge, onBack, onDone }: { challenge: OtpChallenge; onBack: () => void; onDone: (path: string) => void }) {
  const { verifyOtp, resendOtp } = useAuth();
  const [ch, setCh] = useState(challenge);
  const [issuedAt, setIssuedAt] = useState(Date.now());
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState<'verify' | 'resend' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const resendIn = useCountdown(issuedAt + ch.resendInSeconds * 1000);
  const expiresIn = useCountdown(issuedAt + ch.expiresInSeconds * 1000);

  const verify = async (code = otp) => {
    if (code.length !== 6) return;
    setBusy('verify');
    setError(null);
    try {
      onDone(homeFor(await verifyOtp(ch.challengeId, code)));
    } catch (err) {
      setError(errMsg(err));
      setOtp('');
      input.current?.focus();
    } finally {
      setBusy(null);
    }
  };
  const resend = async () => {
    setBusy('resend');
    setError(null);
    try {
      const next = await resendOtp(ch.challengeId);
      setCh(next);
      setIssuedAt(Date.now());
      setOtp('');
      setInfo(`A new OTP was sent to ${next.sentTo}`);
      input.current?.focus();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(null);
    }
  };
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div>
      <div className="mb-8">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700 ring-1 ring-violet-200"><ShieldCheck className="h-3.5 w-3.5" /> Super Admin verification</div>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Enter the OTP</h1>
        <p className="mt-1.5 text-sm text-slate-500">We sent a 6-digit code by SMS to <b className="text-slate-800">{ch.sentTo}</b>.</p>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); verify(); }} className="space-y-4">
        {error && <Callout tone="danger" title={error} />}
        {info && !error && <Callout tone="success" title={info} />}
        {ch.devOtp && <Callout tone="info" title={<>Development mode: OTP is <span className="font-mono tracking-widest">{ch.devOtp}</span></>}>No SMS gateway is set up (SMS_PROVIDER=console), so the code is shown here and in the server log. This never appears in production.</Callout>}
        <Field label="One-time password" hint={expiresIn > 0 ? `Expires in ${mmss(expiresIn)}` : 'This OTP has expired — tap Resend OTP'}>
          <div className="relative">
            <MessageSquareLock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input ref={input} autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} placeholder="••••••"
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, '').slice(0, 6);
                setOtp(v);
                if (v.length === 6) verify(v);
              }}
              className="pl-10 font-mono text-lg tracking-[0.5em]" aria-label="6-digit OTP" />
          </div>
        </Field>
        <Button type="submit" size="lg" loading={busy === 'verify'} disabled={otp.length !== 6} className="w-full" icon={<ShieldCheck className="h-4 w-4" />}>Verify &amp; sign in</Button>
      </form>
      <div className="mt-5 flex items-center justify-between text-sm">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 font-medium text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /> Back</button>
        <button type="button" onClick={resend} disabled={resendIn > 0 || busy === 'resend'} className="inline-flex items-center gap-1.5 font-semibold text-brand-700 hover:text-brand-800 disabled:cursor-not-allowed disabled:text-slate-400">
          <RotateCw className={`h-4 w-4 ${busy === 'resend' ? 'animate-spin' : ''}`} />{resendIn > 0 ? `Resend OTP in ${resendIn}s` : 'Resend OTP'}
        </button>
      </div>
    </div>
  );
}

export default function Login() {
  const { login } = useAuth();
  const { t } = useT();
  const nav = useNavigate();
  const [form, setForm] = useState({ login: '', password: '' });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [otp, setOtp] = useState<OtpChallenge | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await login(form.login.trim(), form.password);
      if (r.otp) setOtp(r.otp);
      else nav(homeFor(r.user), { replace: true });
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  if (otp) {
    return (
      <AuthShell>
        <OtpStep challenge={otp} onBack={() => { setOtp(null); setForm({ ...form, password: '' }); }} onDone={(path) => nav(path, { replace: true })} />
      </AuthShell>
    );
  }

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
