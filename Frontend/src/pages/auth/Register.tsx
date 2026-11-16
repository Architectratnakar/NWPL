import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, UserPlus } from 'lucide-react';
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
  const [done, setDone] = useState<{ distributorCode: string; fullName: string } | null>(null);
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
      setDone(r);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  if (done)
    return (
      <AuthShell>
        <div className="card p-8 text-center">
          <CheckCircle2 className="mx-auto h-14 w-14 text-brand-600" />
          <h1 className="mt-4 text-2xl font-extrabold text-slate-900">Welcome, {done.fullName}!</h1>
          <p className="mt-2 text-sm text-slate-500">Your Distributor ID is</p>
          <p className="mt-1 text-3xl font-black tracking-wider text-brand-800">{done.distributorCode}</p>
          <p className="mt-4 text-sm text-slate-600">Log in and activate your ID by purchasing a joining package.</p>
          <Button className="mt-6 w-full" size="lg" onClick={() => nav('/login')}>Go to login</Button>
        </div>
      </AuthShell>
    );

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
    </AuthShell>
  );
}
