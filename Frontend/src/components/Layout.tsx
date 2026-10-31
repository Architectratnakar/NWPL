import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  Award, BadgeCheck, BarChart3, Boxes, ClipboardList, FileClock, FileText, GitFork, HandCoins, Headphones, IdCard, LayoutDashboard,
  LogOut, Menu, Package, PackageCheck, Presentation, RotateCcw, Settings2, ShieldCheck, ShoppingBag, ShoppingCart, Sparkles, UserCog,
  Users, Wallet, X, Zap, Network, Languages,
} from 'lucide-react';
import { useAuth, type SessionUser } from '@/auth/AuthContext';
import { useT, type TKey } from '@/i18n';
import { Avatar, Badge } from './ui';

interface NavItem { to: string; label: TKey; icon: ReactNode; roles?: SessionUser['role'][] }
interface NavGroup { label: TKey; items: NavItem[] }
const I = 'h-[18px] w-[18px]';

const memberNav: NavGroup[] = [
  { label: 'dashboard', items: [{ to: '/app', label: 'dashboard', icon: <LayoutDashboard className={I} /> }, { to: '/app/activate', label: 'activate', icon: <Zap className={I} /> }] },
  { label: 'network', items: [{ to: '/app/genealogy', label: 'genealogy', icon: <GitFork className={I} /> }, { to: '/app/team', label: 'team', icon: <Users className={I} /> }] },
  { label: 'commerce', items: [{ to: '/app/shop', label: 'shop', icon: <ShoppingBag className={I} /> }, { to: '/app/orders', label: 'orders', icon: <Package className={I} /> }] },
  { label: 'earnings', items: [{ to: '/app/income', label: 'income', icon: <BarChart3 className={I} /> }, { to: '/app/wallet', label: 'wallet', icon: <Wallet className={I} /> }, { to: '/app/ranks', label: 'ranks', icon: <Award className={I} /> }] },
  { label: 'account', items: [{ to: '/app/kyc', label: 'kyc', icon: <BadgeCheck className={I} /> }, { to: '/app/profile', label: 'profile', icon: <IdCard className={I} /> }, { to: '/app/support', label: 'support', icon: <Headphones className={I} /> }, { to: '/app/plan', label: 'plan', icon: <Presentation className={I} /> }] },
];

const FIN = ['ADMIN_SUPER', 'ADMIN_FINANCE'] as SessionUser['role'][];
const OPS = ['ADMIN_SUPER', 'ADMIN_OPS'] as SessionUser['role'][];
const adminNav: NavGroup[] = [
  { label: 'dashboard', items: [{ to: '/admin', label: 'dashboard', icon: <LayoutDashboard className={I} /> }] },
  { label: 'network', items: [
    { to: '/admin/members', label: 'members', icon: <Users className={I} /> },
    { to: '/admin/genealogy', label: 'genealogy', icon: <Network className={I} /> },
    { to: '/admin/kyc', label: 'kycQueue', icon: <ShieldCheck className={I} />, roles: ['ADMIN_SUPER', 'ADMIN_OPS', 'COMPLIANCE'] },
  ] },
  { label: 'commerce', items: [
    { to: '/admin/orders', label: 'adminOrders', icon: <ShoppingCart className={I} /> },
    { to: '/admin/returns', label: 'returns', icon: <RotateCcw className={I} /> },
    { to: '/admin/products', label: 'products', icon: <Boxes className={I} /> },
    { to: '/admin/packages', label: 'packages', icon: <PackageCheck className={I} /> },
  ] },
  { label: 'finance', items: [
    { to: '/admin/closings', label: 'closings', icon: <ClipboardList className={I} />, roles: ['ADMIN_SUPER', 'ADMIN_FINANCE', 'ADMIN_OPS', 'COMPLIANCE'] },
    { to: '/admin/withdrawals', label: 'withdrawals', icon: <HandCoins className={I} />, roles: FIN },
    { to: '/admin/ranks', label: 'rewards', icon: <Award className={I} /> },
    { to: '/admin/reports', label: 'reports', icon: <FileText className={I} />, roles: ['ADMIN_SUPER', 'ADMIN_FINANCE', 'ADMIN_OPS', 'COMPLIANCE'] },
  ] },
  { label: 'system', items: [
    { to: '/admin/tickets', label: 'tickets', icon: <Headphones className={I} />, roles: ['ADMIN_SUPER', 'ADMIN_OPS', 'SUPPORT', 'COMPLIANCE'] },
    { to: '/admin/users', label: 'users', icon: <UserCog className={I} />, roles: ['ADMIN_SUPER'] },
    { to: '/admin/settings', label: 'settings', icon: <Settings2 className={I} /> },
    { to: '/admin/audit', label: 'audit', icon: <FileClock className={I} />, roles: ['ADMIN_SUPER', 'COMPLIANCE'] },
  ] },
];
void OPS;

export function Logo({ dark = false, compact = false }: { dark?: boolean; compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <img src="/brand/logo.png" alt="Navarth Wellness logo" className={clsx('shrink-0 drop-shadow', compact ? 'h-9 w-9' : 'h-11 w-11')} />
      {!compact && (
        <div className="leading-tight">
          <p className={clsx('text-[15px] font-extrabold tracking-tight', dark ? 'text-white' : 'text-brand-900')}>Navarth Wellness</p>
          <p className={clsx('text-[11px] font-medium', dark ? 'text-gold-300' : 'text-gold-600')}>Distributor Portal</p>
        </div>
      )}
    </div>
  );
}

function roleLabel(r: SessionUser['role']) {
  return ({ ADMIN_SUPER: 'Super Admin', ADMIN_OPS: 'Operations', ADMIN_FINANCE: 'Finance', COMPLIANCE: 'Compliance', SUPPORT: 'Support', MEMBER: 'Distributor', FRANCHISE: 'Franchise' } as const)[r];
}

export default function AppLayout({ area }: { area: 'member' | 'admin' }) {
  const { user, logout } = useAuth();
  const { t, lang, setLang } = useT();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const nav = useNavigate();
  useEffect(() => setOpen(false), [loc.pathname]);
  const groups = (area === 'member' ? memberNav : adminNav)
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.roles || (user && i.roles.includes(user.role))) }))
    .filter((g) => g.items.length);

  const sidebar = (
    <div className="flex h-full flex-col bg-gradient-to-b from-brand-900 via-brand-900 to-brand-950 text-brand-50">
      <div className="flex items-center justify-between px-5 pb-3 pt-4">
        <Logo dark />
        <button className="rounded-lg p-1.5 text-brand-200 hover:bg-white/10 lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu"><X className="h-5 w-5" /></button>
      </div>
      {area === 'member' && user && (
        <div className="mx-4 mb-3 rounded-2xl bg-white/[0.06] p-3 ring-1 ring-white/10">
          <div className="flex items-center gap-3">
            <Avatar name={user.name} size={38} className="from-gold-400 to-gold-600" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{user.name}</p>
              <p className="text-xs text-brand-200">{user.distributorCode}</p>
            </div>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <Badge status={user.packageTier ?? 'NONE'} className="!bg-white/10 !text-white !ring-white/15" />
            {user.rank && <Badge className="!bg-gold-400/20 !text-gold-100 !ring-gold-300/30"><Sparkles className="h-3 w-3" />{user.rank}</Badge>}
          </div>
        </div>
      )}
      <nav className="scrollbar-thin flex-1 space-y-3.5 overflow-y-auto px-3 pb-3">
        {groups.map((g) => (
          <div key={g.label}>
            <p className="mb-1 px-3 text-[10.5px] font-bold uppercase tracking-[0.12em] text-brand-300/70">{t(g.label)}</p>
            <div className="space-y-0.5">
              {g.items.map((i) => (
                <NavLink key={i.to} to={i.to} end={i.to === '/app' || i.to === '/admin'}
                  className={({ isActive }) => clsx('flex items-center gap-3 rounded-xl px-3 py-[7px] text-[13.5px] font-medium transition',
                    isActive ? 'bg-white text-brand-900 shadow-sm' : 'text-brand-100/85 hover:bg-white/[0.07] hover:text-white')}>
                  {i.icon}{t(i.label)}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-white/10 p-3">
        <button onClick={async () => { await logout(); nav('/login'); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-[13.5px] font-medium text-brand-100/85 hover:bg-white/[0.07] hover:text-white">
          <LogOut className={I} />{t('logout')}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:pl-[264px]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOpen(false)} />
          <aside className="animate-fade-in absolute inset-y-0 left-0 w-[280px] max-w-[85vw]">{sidebar}</aside>
        </div>
      )}
      <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200/70 bg-white/85 px-4 backdrop-blur sm:px-6">
        <button className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></button>
        <div className="lg:hidden"><Logo compact /></div>
        <div className="hidden text-sm text-slate-500 lg:block">
          {area === 'admin' ? <span className="font-semibold text-slate-700">{t('admin')}</span> : <span>Namaste, <b className="text-slate-800">{user?.name?.split(' ')[0]}</b> 🙏</span>}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setLang(lang === 'en' ? 'hi' : 'en')} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50" title="Change language">
            <Languages className="h-4 w-4" />{lang === 'en' ? 'हिंदी' : 'English'}
          </button>
          <div className="hidden items-center gap-2.5 rounded-xl border border-slate-200 py-1 pl-1 pr-3 sm:flex">
            <Avatar name={user?.name} size={30} />
            <div className="leading-tight">
              <p className="max-w-[160px] truncate text-xs font-bold text-slate-800">{user?.name}</p>
              <p className="text-[11px] text-slate-500">{user && roleLabel(user.role)}{user?.distributorCode ? ` · ${user.distributorCode}` : ''}</p>
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
}
