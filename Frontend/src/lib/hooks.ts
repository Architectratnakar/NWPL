import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { errMsg } from '@/api/client';
import { useToast } from '@/components/ui';

/** Run an async action with a loading flag, a toast, and query invalidation. */
export function useAction() {
  const [busy, setBusy] = useState<string | null>(null);
  const toast = useToast();
  const qc = useQueryClient();
  const run = async <T,>(key: string, fn: () => Promise<T>, opts: { success?: string; invalidate?: string[] } = {}) => {
    setBusy(key);
    try {
      const r = await fn();
      if (opts.success) toast.success(opts.success);
      for (const k of opts.invalidate ?? []) await qc.invalidateQueries({ queryKey: [k] });
      return r;
    } catch (e) {
      toast.error(errMsg(e));
      return undefined;
    } finally {
      setBusy(null);
    }
  };
  return { busy, run };
}
