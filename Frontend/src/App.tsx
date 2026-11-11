import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { homeFor, useAuth } from '@/auth/AuthContext';
import AppLayout from '@/components/Layout';
import { PageLoader } from '@/components/ui';
import Login from '@/pages/auth/Login';
import Register from '@/pages/auth/Register';
import ForgotPassword from '@/pages/auth/ForgotPassword';

// member area
const MemberDashboard = lazy(() => import('@/pages/member/Dashboard'));
const Activate = lazy(() => import('@/pages/member/Activate'));
const Shop = lazy(() => import('@/pages/member/Shop'));
const Orders = lazy(() => import('@/pages/member/Orders'));
const Genealogy = lazy(() => import('@/pages/member/Genealogy'));
const Team = lazy(() => import('@/pages/member/Team'));
const Income = lazy(() => import('@/pages/member/Income'));
const Wallet = lazy(() => import('@/pages/member/Wallet'));
const Ranks = lazy(() => import('@/pages/member/Ranks'));
const Kyc = lazy(() => import('@/pages/member/Kyc'));
const Profile = lazy(() => import('@/pages/member/Profile'));
const Support = lazy(() => import('@/pages/member/Support'));
const Plan = lazy(() => import('@/pages/member/Plan'));
const MemberAutopool = lazy(() => import('@/pages/member/Autopool'));
// admin area
const AdminDashboard = lazy(() => import('@/pages/admin/Dashboard'));
const MembersList = lazy(() => import('@/pages/admin/Members').then((m) => ({ default: m.MembersList })));
const MemberDetail = lazy(() => import('@/pages/admin/Members').then((m) => ({ default: m.MemberDetail })));
const StaffUsers = lazy(() => import('@/pages/admin/Users'));
const KycQueue = lazy(() => import('@/pages/admin/Kyc'));
const Products = lazy(() => import('@/pages/admin/Commerce').then((m) => ({ default: m.Products })));
const Packages = lazy(() => import('@/pages/admin/Commerce').then((m) => ({ default: m.Packages })));
const AdminOrders = lazy(() => import('@/pages/admin/Commerce').then((m) => ({ default: m.AdminOrders })));
const Returns = lazy(() => import('@/pages/admin/Commerce').then((m) => ({ default: m.Returns })));
const Closings = lazy(() => import('@/pages/admin/Finance').then((m) => ({ default: m.Closings })));
const ClosingDetail = lazy(() => import('@/pages/admin/Finance').then((m) => ({ default: m.ClosingDetail })));
const Withdrawals = lazy(() => import('@/pages/admin/Finance').then((m) => ({ default: m.Withdrawals })));
const RanksAdmin = lazy(() => import('@/pages/admin/Finance').then((m) => ({ default: m.RanksAdmin })));
const Reports = lazy(() => import('@/pages/admin/Finance').then((m) => ({ default: m.Reports })));
const Settings = lazy(() => import('@/pages/admin/System').then((m) => ({ default: m.Settings })));
const AdminTickets = lazy(() => import('@/pages/admin/System').then((m) => ({ default: m.AdminTickets })));
const Audit = lazy(() => import('@/pages/admin/System').then((m) => ({ default: m.Audit })));
const AdminIncome = lazy(() => import('@/pages/admin/Income'));
const AdminAutopool = lazy(() => import('@/pages/admin/Autopool'));
const FranchiseList = lazy(() => import('@/pages/admin/Franchises').then((m) => ({ default: m.FranchiseList })));
const FranchiseDetail = lazy(() => import('@/pages/admin/Franchises').then((m) => ({ default: m.FranchiseDetail })));
// franchise counter
const FranchiseDashboard = lazy(() => import('@/pages/franchise/Panel').then((m) => ({ default: m.FranchiseDashboard })));
const FranchiseNewSale = lazy(() => import('@/pages/franchise/Panel').then((m) => ({ default: m.NewSale })));
const FranchiseStock = lazy(() => import('@/pages/franchise/Panel').then((m) => ({ default: m.FranchiseStock })));
const FranchiseSales = lazy(() => import('@/pages/franchise/Panel').then((m) => ({ default: m.FranchiseSales })));
const FranchiseCommission = lazy(() => import('@/pages/franchise/Panel').then((m) => ({ default: m.FranchiseCommission })));

function Guard({ area, children }: { area: 'member' | 'admin' | 'franchise'; children: ReactNode }) {
  const { user, loading, isStaff } = useAuth();
  if (loading) return <div className="grid min-h-screen place-items-center"><PageLoader /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (area === 'admin' && !isStaff) return <Navigate to={homeFor(user)} replace />;
  if (area === 'member' && (isStaff || !user.memberId)) return <Navigate to={homeFor(user)} replace />;
  if (area === 'franchise' && user.role !== 'FRANCHISE') return <Navigate to={homeFor(user)} replace />;
  return <>{children}</>;
}

/** Pages only the Super Admin may open (others are sent to the admin dashboard) */
function SuperOnly({ children }: { children: ReactNode }) {
  const { hasRole } = useAuth();
  return hasRole('ADMIN_SUPER') ? <>{children}</> : <Navigate to="/admin" replace />;
}

function Home() {
  const { user, loading } = useAuth();
  if (loading) return <div className="grid min-h-screen place-items-center"><PageLoader /></div>;
  return <Navigate to={!user ? '/login' : homeFor(user)} replace />;
}

const S = ({ children }: { children: ReactNode }) => <Suspense fallback={<PageLoader />}>{children}</Suspense>;

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />

      <Route path="/app" element={<Guard area="member"><AppLayout area="member" /></Guard>}>
        <Route index element={<S><MemberDashboard /></S>} />
        <Route path="activate" element={<S><Activate /></S>} />
        <Route path="shop" element={<S><Shop /></S>} />
        <Route path="orders" element={<S><Orders /></S>} />
        <Route path="genealogy" element={<S><Genealogy /></S>} />
        <Route path="team" element={<S><Team /></S>} />
        <Route path="income" element={<S><Income /></S>} />
        <Route path="wallet" element={<S><Wallet /></S>} />
        <Route path="ranks" element={<S><Ranks /></S>} />
        <Route path="kyc" element={<S><Kyc /></S>} />
        <Route path="profile" element={<S><Profile /></S>} />
        <Route path="support" element={<S><Support /></S>} />
        <Route path="plan" element={<S><Plan /></S>} />
        <Route path="autopool" element={<S><MemberAutopool /></S>} />
      </Route>

      <Route path="/franchise" element={<Guard area="franchise"><AppLayout area="franchise" /></Guard>}>
        <Route index element={<S><FranchiseDashboard /></S>} />
        <Route path="sale" element={<S><FranchiseNewSale /></S>} />
        <Route path="stock" element={<S><FranchiseStock /></S>} />
        <Route path="sales" element={<S><FranchiseSales /></S>} />
        <Route path="commission" element={<S><FranchiseCommission /></S>} />
      </Route>

      <Route path="/admin" element={<Guard area="admin"><AppLayout area="admin" /></Guard>}>
        <Route index element={<S><AdminDashboard /></S>} />
        <Route path="members" element={<S><MembersList /></S>} />
        <Route path="members/:id" element={<S><MemberDetail /></S>} />
        <Route path="genealogy" element={<S><Genealogy admin /></S>} />
        <Route path="kyc" element={<S><KycQueue /></S>} />
        <Route path="users" element={<S><StaffUsers /></S>} />
        <Route path="products" element={<S><Products /></S>} />
        <Route path="packages" element={<S><Packages /></S>} />
        <Route path="orders" element={<S><AdminOrders /></S>} />
        <Route path="returns" element={<S><Returns /></S>} />
        <Route path="closings" element={<S><Closings /></S>} />
        <Route path="closings/:id" element={<S><ClosingDetail /></S>} />
        <Route path="income" element={<SuperOnly><S><AdminIncome /></S></SuperOnly>} />
        <Route path="autopool" element={<SuperOnly><S><AdminAutopool /></S></SuperOnly>} />
        <Route path="franchises" element={<S><FranchiseList /></S>} />
        <Route path="franchises/:id" element={<S><FranchiseDetail /></S>} />
        <Route path="withdrawals" element={<S><Withdrawals /></S>} />
        <Route path="ranks" element={<S><RanksAdmin /></S>} />
        <Route path="reports" element={<S><Reports /></S>} />
        <Route path="settings" element={<S><Settings /></S>} />
        <Route path="tickets" element={<S><AdminTickets /></S>} />
        <Route path="audit" element={<S><Audit /></S>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
