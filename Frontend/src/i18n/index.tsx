import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

type Lang = 'en' | 'hi';

const dict = {
  en: {
    tagline: 'Jiyo Zindagi Shaan Se', welcome: 'Welcome back', loginSub: 'Sign in to your distributor or admin account',
    userId: 'Distributor ID / Mobile / Email', password: 'Password', login: 'Sign in', forgot: 'Forgot password?',
    noAccount: 'New distributor?', register: 'Create an account', demo: 'Demo logins — click to fill',
    dashboard: 'Dashboard', activate: 'Activate / Upgrade', shop: 'Shop', orders: 'My Orders', genealogy: 'Genealogy Tree',
    team: 'My Team', income: 'Income', wallet: 'Wallet & Payouts', ranks: 'Ranks & Rewards', kyc: 'KYC', profile: 'Profile',
    support: 'Support', plan: 'Business Plan', logout: 'Log out', members: 'Distributors', users: 'Staff Users',
    products: 'Products', packages: 'Packages', closings: 'Closings', withdrawals: 'Withdrawals', settings: 'Plan Settings',
    reports: 'Reports', returns: 'Returns', audit: 'Audit Log', tickets: 'Support Tickets', kycQueue: 'KYC Review', rewards: 'Ranks & Rewards',
    network: 'Network', commerce: 'Commerce', earnings: 'Earnings', account: 'Account', admin: 'Administration', finance: 'Finance', system: 'System',
    adminOrders: 'Orders',
  },
  hi: {
    tagline: 'जियो ज़िंदगी शान से', welcome: 'फिर से स्वागत है', loginSub: 'अपने डिस्ट्रीब्यूटर या एडमिन खाते में लॉग इन करें',
    userId: 'डिस्ट्रीब्यूटर आईडी / मोबाइल / ईमेल', password: 'पासवर्ड', login: 'लॉग इन', forgot: 'पासवर्ड भूल गए?',
    noAccount: 'नए डिस्ट्रीब्यूटर?', register: 'खाता बनाएं', demo: 'डेमो लॉगिन — भरने के लिए क्लिक करें',
    dashboard: 'डैशबोर्ड', activate: 'एक्टिवेट / अपग्रेड', shop: 'खरीदारी', orders: 'मेरे ऑर्डर', genealogy: 'जीनियोलॉजी ट्री',
    team: 'मेरी टीम', income: 'आय', wallet: 'वॉलेट और भुगतान', ranks: 'रैंक और रिवॉर्ड', kyc: 'केवाईसी', profile: 'प्रोफ़ाइल',
    support: 'सहायता', plan: 'बिज़नेस प्लान', logout: 'लॉग आउट', members: 'डिस्ट्रीब्यूटर', users: 'स्टाफ़ यूज़र',
    products: 'उत्पाद', packages: 'पैकेज', closings: 'क्लोज़िंग', withdrawals: 'निकासी', settings: 'प्लान सेटिंग',
    reports: 'रिपोर्ट', returns: 'वापसी', audit: 'ऑडिट लॉग', tickets: 'सहायता टिकट', kycQueue: 'केवाईसी जांच', rewards: 'रैंक और रिवॉर्ड',
    network: 'नेटवर्क', commerce: 'कॉमर्स', earnings: 'कमाई', account: 'खाता', admin: 'प्रशासन', finance: 'वित्त', system: 'सिस्टम',
    adminOrders: 'ऑर्डर',
  },
} as const;

export type TKey = keyof (typeof dict)['en'];
const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void; t: (k: TKey) => string }>({ lang: 'en', setLang: () => {}, t: (k) => k });

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => {
    try {
      return (localStorage.getItem('lang') as Lang) || 'en';
    } catch {
      return 'en';
    }
  });
  useEffect(() => {
    document.documentElement.lang = lang;
    try {
      localStorage.setItem('lang', lang);
    } catch {
      /* ignore */
    }
  }, [lang]);
  return <Ctx.Provider value={{ lang, setLang, t: (k) => dict[lang][k] ?? dict.en[k] }}>{children}</Ctx.Provider>;
}
export const useT = () => useContext(Ctx);
