import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Check, CheckCircle2, Copy, Eye, EyeOff, LogIn, UserPlus } from 'lucide-react';
import { errMsg, get, post } from '@/api/client';
import { Button, Callout, Field, Input, Select } from '@/components/ui';
import AuthShell from './AuthShell';

export default function Register() {
  const [qs] = useSearchParams();
  const nav = useNavigate();
  const [f, setF] = useState({
    sponsorCode: qs.get('sponsor') ?? '', side: (qs.get('side') as 'LEFT' | 'RIGHT') ?? 'LEFT', fullName: '', mobile: '', email: '',
    gender: '', dob: '', city: '', state: '', pincode: '', password: '', confirm: '', acceptAgreement: false,
  });
  const [sponsor, setSponsor] = useState<{ name: string } | null>(null);
  const [sponsorErr, setSponsorErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Registered | null>(null);
  const up = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  useEffect(() => {
    setSponsor(null);
    setSponsorErr(null);
    if (f.sponsorCode.length < 7) return;
    const id = setTimeout(() => {
      get(`/public/sponsor/${f.sponsorCode}`).then(setSponsor).catch(() => setSponsorErr('Sponsor ID not found'));
    }, 350);
    return () => clearTimeout(id);
  }, [f.sponsorCode]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (f.password !== f.confirm) return setError('Passwords do not match');
    setBusy(true);
    try {
      const { confirm, ...body } = f;
      void confirm;
      const r = await post('/public/register', { ...body, gender: body.gender || undefined, dob: body.dob || undefined, email: body.email || undefined });
      setDone({ ...r, password: f.password, mobile: f.mobile, side: f.side, sponsorCode: f.sponsorCode, sponsorName: sponsor?.name ?? '' });
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell wide>
      <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Become a distributor</h1>
      <p className="mt-1.5 text-sm text-slate-500">Registration is free. Your ID is activated only when you buy a product package.</p>
      <form onSubmit={submit} className="mt-6 space-y-5">
        {error && <Callout tone="danger" title={error} />}
        <div className="card grid gap-4 p-4 sm:grid-cols-2">
          <Field label="Sponsor ID *" error={sponsorErr} hint={sponsor ? <span className="font-semibold text-brand-700">✓ {sponsor.name}</span> : 'The ID of the person who introduced you'}>
            <Input required value={f.sponsorCode} onChange={(e) => setF({ ...f, sponsorCode: e.target.value.toUpperCase() })} placeholder="NW100001" />
          </Field>
          <Field label="Placement side *" hint="Placed at the bottom of that side of your sponsor's tree">
            <div className="grid grid-cols-2 gap-2">
              {(['LEFT', 'RIGHT'] as const).map((s) => (
                <button type="button" key={s} onClick={() => setF({ ...f, side: s })}
                  className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${f.side === s ? 'border-brand-600 bg-brand-50 text-brand-800 ring-4 ring-brand-100' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}>
                  {s === 'LEFT' ? '← Left' : 'Right →'}
                </button>
              ))}
            </div>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name (as on PAN) *"><Input required value={f.fullName} onChange={up('fullName')} /></Field>
          <Field label="Mobile number *"><Input required inputMode="numeric" maxLength={10} value={f.mobile} onChange={up('mobile')} placeholder="10-digit mobile" /></Field>
          <Field label="Email"><Input type="email" value={f.email} onChange={up('email')} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Gender"><Select value={f.gender} onChange={up('gender')} placeholder="Select" options={[{ value: 'MALE', label: 'Male' }, { value: 'FEMALE', label: 'Female' }, { value: 'OTHER', label: 'Other' }]} /></Field>
            <Field label="Date of birth"><Input type="date" value={f.dob} onChange={up('dob')} /></Field>
          </div>
          <Field label="City"><Input value={f.city} onChange={up('city')} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="State"><Input value={f.state} onChange={up('state')} /></Field>
            <Field label="PIN code"><Input inputMode="numeric" maxLength={6} value={f.pincode} onChange={up('pincode')} /></Field>
          </div>
          <Field label="Password *" hint="8+ characters, one capital letter and one number"><Input type="password" required value={f.password} onChange={up('password')} /></Field>
          <Field label="Confirm password *"><Input type="password" required value={f.confirm} onChange={up('confirm')} /></Field>
        </div>
        <label className="flex items-start gap-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-700" checked={f.acceptAgreement} onChange={(e) => setF({ ...f, acceptAgreement: e.target.checked })} />
          <span>I have read and accept the <b>Distributor Agreement</b>, <b>Privacy Notice</b> and <b>Return Policy</b>. I understand income depends on genuine product sales and is not guaranteed.</span>
        </label>
        <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!f.acceptAgreement} icon={<UserPlus className="h-4 w-4" />}>Create my account</Button>
        <p className="text-center text-sm text-slate-500">Already registered? <Link to="/login" className="link">Sign in</Link></p>
      </form>
      {done && (
        <RegisteredPopup
          r={done}
          onLogin={() => nav('/login', { state: { login: done.distributorCode } })}
          onRegisterAnother={() => {
            // keep the sponsor and side so a sponsor can register the next person quickly
            setF((x) => ({ ...x, fullName: '', mobile: '', email: '', gender: '', dob: '', city: '', state: '', pincode: '', password: '', confirm: '', acceptAgreement: false }));
            setDone(null);
            window.scrollTo({ top: 0 });
          }}
        />
      )}
    </AuthShell>
  );
}

type Registered = { distributorCode: string; fullName: string; password: string; mobile: string; side: 'LEFT' | 'RIGHT'; sponsorCode: string; sponsorName: string };

/** "Registration complete" popup: the new ID, password, sponsor and the two next steps. */
function RegisteredPopup({ r, onLogin, onRegisterAnother }: { r: Registered; onLogin: () => void; onRegisterAnother: () => void }) {
  const [showPwd, setShowPwd] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (key: string, text: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    }).catch(() => undefined);
  };
  // shared text never contains the password
  const summary = `Navarth Wellness – registration complete\nName: ${r.fullName}\nUser ID: ${r.distributorCode}\nSponsor ID: ${r.sponsorCode}${r.sponsorName ? ` (${r.sponsorName})` : ''}\nLogin: ${window.location.origin}/login`;

  const rows: { label: string; value: ReactNode; copyText?: string; key: string }[] = [
    { key: 'id', label: 'User ID', value: <span className="font-mono text-lg font-black tracking-wider text-brand-800">{r.distributorCode}</span>, copyText: r.distributorCode },
    {
      key: 'pwd',
      label: 'Password',
      value: (
        <span className="inline-flex items-center gap-2">
          <span className="font-mono font-semibold">{showPwd ? r.password : '•'.repeat(Math.min(r.password.length, 10))}</span>
          <button type="button" onClick={() => setShowPwd((v) => !v)} className="text-slate-400 hover:text-slate-700" aria-label={showPwd ? 'Hide password' : 'Show password'}>
            {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </span>
      ),
    },
    { key: 'sponsor', label: 'Sponsor ID', value: <span><span className="font-mono font-bold">{r.sponsorCode}</span>{r.sponsorName && <span className="block text-xs text-slate-500">{r.sponsorName}</span>}</span> },
    { key: 'mobile', label: 'Mobile', value: <span className="font-mono">{r.mobile}</span> },
    { key: 'side', label: 'Placement', value: r.side === 'LEFT' ? 'Left side' : 'Right side' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="reg-done-title">
      <div className="animate-fade-in my-auto w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl ring-4 ring-brand-600/80">
        <div className="h-2 bg-gradient-to-r from-brand-700 via-gold-400 to-brand-700" />
        <div className="px-5 pb-6 pt-6 text-center sm:px-7">
          <img src="/brand/logo.png" alt="Navarth Wellness Pvt. Ltd. logo" className="mx-auto h-24 w-24 drop-shadow-lg" />
          <p className="mt-3 text-lg font-extrabold uppercase tracking-wide text-brand-900">Navarth Wellness</p>
          <p className="mt-1 text-base font-semibold text-slate-800">Thank you, {r.fullName}</p>
          <h2 id="reg-done-title" className="mt-2 flex items-center justify-center gap-2 text-2xl font-extrabold leading-tight text-brand-700">
            <CheckCircle2 className="h-7 w-7 shrink-0" /> Registration complete!
          </h2>

          <div className="mt-5 overflow-hidden rounded-xl border border-slate-300">
          <table className="w-full text-left text-sm">
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-b border-slate-200 last:border-0">
                  <th scope="row" className="w-[38%] bg-slate-50 px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">{row.label}</th>
                  <td className="px-3 py-3 text-slate-900">
                    <div className="flex items-center justify-between gap-2">
                      {row.value}
                      {row.copyText && (
                        <button type="button" onClick={() => copy(row.key, row.copyText!)} className="text-slate-400 hover:text-brand-700" aria-label={`Copy ${row.label}`}>
                          {copied === row.key ? <Check className="h-4 w-4 text-brand-700" /> : <Copy className="h-4 w-4" />}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>

          <p className="mt-4 rounded-xl bg-gold-50 px-3 py-2.5 text-sm text-gold-700 ring-1 ring-gold-100">
            Save your <b>User ID</b> and <b>password</b> (take a screenshot). Log in and activate your ID by purchasing a joining package.
          </p>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <Button size="lg" onClick={onLogin} icon={<LogIn className="h-4 w-4" />}>Login now</Button>
            <Button size="lg" variant="secondary" onClick={onRegisterAnother} icon={<UserPlus className="h-4 w-4" />}>Register</Button>
          </div>
          <button type="button" onClick={() => copy('all', summary)} className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:text-brand-800">
            {copied === 'all' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied === 'all' ? 'Details copied' : 'Copy details to share (without password)'}
          </button>
        </div>
      </div>
    </div>
  );
}
