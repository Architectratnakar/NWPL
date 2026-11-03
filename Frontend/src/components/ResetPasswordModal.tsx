import { useState } from 'react';
import { Check, Copy, KeyRound, ShieldCheck, Wand2 } from 'lucide-react';
import { post } from '@/api/client';
import { Button, Callout, Field, Input, Modal, useToast } from './ui';
import { useAction } from '@/lib/hooks';

export interface ResetTarget { id: string; code: string; name: string }

const rules = (p: string) => [
  { ok: p.length >= 8, text: 'At least 8 characters' },
  { ok: /[A-Z]/.test(p), text: 'One capital letter' },
  { ok: /[0-9]/.test(p), text: 'One number' },
];

/** Super Admin: set or generate a new password for a distributor. */
export default function ResetPasswordModal({ target, onClose }: { target: ResetTarget | null; onClose: () => void }) {
  const [mode, setMode] = useState<'generate' | 'manual'>('generate');
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [result, setResult] = useState<{ password: string; generated: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const { busy, run } = useAction();
  const toast = useToast();
  if (!target) return null;

  const close = () => { setMode('generate'); setPw(''); setResult(null); setCopied(false); onClose(); };
  const valid = mode === 'generate' || rules(pw).every((r) => r.ok);
  const submit = () =>
    run('reset', () => post(`/admin/members/${target.id}/reset-password`, mode === 'manual' ? { password: pw } : {}), { success: `Password reset for ${target.code}` })
      .then((r: any) => { if (r) setResult({ password: r.password ?? pw, generated: r.generated }); });
  const copy = () => {
    navigator.clipboard?.writeText(`Distributor ID: ${target.code}\nPassword: ${result!.password}`);
    setCopied(true);
    toast.success('Copied');
  };

  return (
    <Modal open onClose={close} size="sm" title={result ? 'Password changed' : `Reset password — ${target.name}`}
      footer={result ? <Button onClick={close}>Done</Button> : <>
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <Button loading={busy === 'reset'} disabled={!valid} icon={<KeyRound className="h-4 w-4" />} onClick={submit}>{mode === 'generate' ? 'Generate & reset' : 'Set password'}</Button>
      </>}>
      {result ? (
        <div className="space-y-4">
          <Callout tone="success" title={`New login for ${target.name}`}>The distributor has been logged out of all devices.</Callout>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Distributor ID</p>
            <p className="font-mono text-lg font-bold text-slate-900">{target.code}</p>
            <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">New password</p>
            <p className="font-mono text-lg font-bold text-brand-800">{result.password}</p>
          </div>
          <Button variant="outline" className="w-full" icon={copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} onClick={copy}>{copied ? 'Copied' : 'Copy ID & password'}</Button>
          <p className="text-xs text-slate-500">This password is shown only once. Share it privately with the distributor and ask them to change it under <b>Profile → Password</b>.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Distributor <b>{target.code}</b>. Their current password stops working immediately.</p>
          <div className="grid grid-cols-2 gap-2">
            {([['generate', 'Generate strong', <Wand2 key="g" className="h-4 w-4" />], ['manual', 'Type my own', <KeyRound key="m" className="h-4 w-4" />]] as const).map(([v, l, ic]) => (
              <button key={v} type="button" onClick={() => setMode(v)}
                className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${mode === v ? 'border-brand-600 bg-brand-50 text-brand-800 ring-4 ring-brand-100' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}>{ic}{l}</button>
            ))}
          </div>
          {mode === 'manual' ? (
            <Field label="New password">
              <div className="relative">
                <Input type={show ? 'text' : 'password'} value={pw} onChange={(e) => setPw(e.target.value)} autoFocus className="pr-16" />
                <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500 hover:text-slate-800">{show ? 'Hide' : 'Show'}</button>
              </div>
              <ul className="mt-2 space-y-1">
                {rules(pw).map((r) => <li key={r.text} className={`flex items-center gap-1.5 text-xs ${r.ok ? 'text-brand-700' : 'text-slate-400'}`}><Check className="h-3.5 w-3.5" />{r.text}</li>)}
              </ul>
            </Field>
          ) : (
            <div className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-600"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" /><p>A strong, easy-to-read password (for example <span className="font-mono font-semibold">Kpqr@4827</span>) is created and shown to you once.</p></div>
          )}
        </div>
      )}
    </Modal>
  );
}
