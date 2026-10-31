import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, refreshSession, setAccessToken, setSessionExpiredHandler } from '@/api/client';
import { useQueryClient } from '@tanstack/react-query';

export interface SessionUser {
  id: string;
  role: 'MEMBER' | 'FRANCHISE' | 'ADMIN_SUPER' | 'ADMIN_OPS' | 'ADMIN_FINANCE' | 'COMPLIANCE' | 'SUPPORT';
  memberId: string | null;
  name: string;
  email: string | null;
  mobile: string;
  distributorCode: string | null;
  packageTier: 'NONE' | 'BASIC' | 'FULL' | null;
  memberStatus: string | null;
  rank: string | null;
}

interface AuthState {
  user: SessionUser | null;
  loading: boolean;
  isStaff: boolean;
  login: (login: string, password: string) => Promise<SessionUser>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  hasRole: (...roles: SessionUser['role'][]) => boolean;
}

const Ctx = createContext<AuthState | null>(null);
export const STAFF_ROLES: SessionUser['role'][] = ['ADMIN_SUPER', 'ADMIN_OPS', 'ADMIN_FINANCE', 'COMPLIANCE', 'SUPPORT'];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const qc = useQueryClient();

  const apply = (d: { accessToken: string; user: SessionUser }) => {
    setAccessToken(d.accessToken);
    setUser(d.user);
    return d.user;
  };

  // restore the session on page load using the refresh cookie
  useEffect(() => {
    refreshSession()
      .then((d) => apply(d))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
    setSessionExpiredHandler(() => {
      setAccessToken(null);
      setUser(null);
    });
  }, []);

  const login = useCallback(async (login: string, password: string) => {
    const r = await api.post('/auth/login', { login, password });
    qc.clear();
    return apply(r.data.data);
  }, [qc]);

  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => {});
    setAccessToken(null);
    setUser(null);
    qc.clear();
  }, [qc]);

  const refreshUser = useCallback(async () => {
    const r = await api.get('/auth/me');
    apply(r.data.data);
  }, []);

  const isStaff = !!user && STAFF_ROLES.includes(user.role);
  const hasRole = (...roles: SessionUser['role'][]) => !!user && roles.includes(user.role);

  return <Ctx.Provider value={{ user, loading, isStaff, login, logout, refreshUser, hasRole }}>{children}</Ctx.Provider>;
}

export const useAuth = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth outside AuthProvider');
  return c;
};
