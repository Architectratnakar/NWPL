import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Send } from 'lucide-react';
import { errMsg, post } from '@/api/client';
import { Button, Callout, Field, Input } from '@/components/ui';
import AuthShell from './AuthShell';

export default function ForgotPassword() {
  const [login, setLogin] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await post('/auth/forgot-password', { login });
      setMsg(r.message);
    } catch (x) {
      setErr(errMsg(x));
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthShell>
      <Link to="/login" className="mb-6 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /> Back to sign in</Link>
      <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Reset your password</h1>
      <p className="mt-1.5 text-sm text-slate-500">Enter your Distributor ID, mobile or email. We will send reset instructions to your registered mobile.</p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        {msg && <Callout tone="success" title={msg}>In this demo, an admin can set a new password from <b>Admin → Distributors</b> or <b>Staff Users</b>.</Callout>}
        {err && <Callout tone="danger" title={err} />}
        <Field label="Distributor ID / Mobile / Email"><Input required value={login} onChange={(e) => setLogin(e.target.value)} /></Field>
        <Button type="submit" size="lg" className="w-full" loading={busy} icon={<Send className="h-4 w-4" />}>Send reset instructions</Button>
      </form>
    </AuthShell>
  );
}
