import { useEffect, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { Languages, Leaf, ShieldCheck, Truck } from 'lucide-react';
import { useT } from '@/i18n';

const SLIDES = [
  { src: '/brand/slide-retail-profit.jpg', title: 'Retail profit on every product', text: 'Earn 10%–40% retail margin on the Navarth herbal range.' },
  { src: '/brand/product-price-list.jpg', title: '26 wellness products', text: 'Juices, drops, personal care and kitchen essentials — MRP, DP & BV at a glance.', portrait: true },
  { src: '/brand/slide-joining-package.jpg', title: 'Start with a product package', text: '40 BV (₹2,000) or 100 BV (₹5,000) — real products, GST invoice.' },
  { src: '/brand/slide-director-message.jpg', title: 'A message from our Director', text: '“Write your own destiny — and keep every family healthy.”' },
];

/** Split-screen brand panel used by Login / Register / Forgot password */
export default function AuthShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  const [i, setI] = useState(0);
  const { lang, setLang, t } = useT();
  useEffect(() => {
    const id = setInterval(() => setI((x) => (x + 1) % SLIDES.length), 5500);
    return () => clearInterval(id);
  }, []);
  const s = SLIDES[i];

  return (
    <div className="flex min-h-screen bg-white">
      {/* ------- brand panel ------- */}
      <aside className="relative hidden w-[46%] max-w-[760px] overflow-hidden bg-brand-950 lg:flex lg:flex-col">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(224,171,58,0.22),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(124,58,237,0.25),transparent_55%)]" />
        <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full border-[40px] border-white/[0.03]" />
        <div className="relative z-10 flex flex-1 flex-col px-12 py-10">
          <div className="flex items-center gap-4">
            <img src="/brand/logo.png" alt="Navarth Wellness Pvt. Ltd. logo" className="h-20 w-20 drop-shadow-xl" />
            <div>
              <p className="text-2xl font-extrabold tracking-tight text-white">Navarth Wellness</p>
              <p className="text-sm font-medium text-gold-300">Pvt. Ltd. · <span className="hi">{t('tagline')}</span></p>
            </div>
          </div>

          <div className="mt-10 flex flex-1 flex-col justify-center">
            <div className="relative overflow-hidden rounded-3xl bg-white/5 shadow-2xl ring-1 ring-white/10">
              <div className={clsx('relative w-full', s.portrait ? 'aspect-[16/10]' : 'aspect-video')}>
                {SLIDES.map((sl, k) => (
                  <img key={sl.src} src={sl.src} alt={sl.title}
                    className={clsx('absolute inset-0 h-full w-full transition-opacity duration-700', sl.portrait ? 'object-cover object-top' : 'object-cover', k === i ? 'opacity-100' : 'opacity-0')} />
                ))}
              </div>
            </div>
            <div className="mt-6 min-h-[72px]">
              <p key={s.title} className="animate-fade-in text-xl font-bold text-white">{s.title}</p>
              <p key={s.text} className="animate-fade-in mt-1 text-sm text-brand-100/80">{s.text}</p>
            </div>
            <div className="mt-2 flex gap-2">
              {SLIDES.map((_, k) => (
                <button key={k} onClick={() => setI(k)} aria-label={`Show slide ${k + 1}`} className={clsx('h-1.5 rounded-full transition-all', k === i ? 'w-8 bg-gold-400' : 'w-3 bg-white/25 hover:bg-white/40')} />
              ))}
            </div>
          </div>

          <div className="mt-8 grid grid-cols-3 gap-3 text-xs text-brand-100/85">
            {[[<Leaf key="l" className="h-4 w-4" />, 'Pure · Natural · Wellness'], [<ShieldCheck key="s" className="h-4 w-4" />, 'KYC-verified payouts'], [<Truck key="t" className="h-4 w-4" />, 'GST invoice on every order']].map(([ic, tx], k) => (
              <div key={k} className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2.5 ring-1 ring-white/10"><span className="text-gold-300">{ic}</span>{tx}</div>
            ))}
          </div>
        </div>
      </aside>

      {/* ------- form panel ------- */}
      <main className="relative flex flex-1 flex-col">
        <div className="flex items-center justify-between px-5 py-4 sm:px-10">
          <div className="flex items-center gap-2.5 lg:invisible">
            <img src="/brand/logo.png" alt="" className="h-10 w-10" />
            <div className="leading-tight"><p className="text-sm font-extrabold text-brand-900">Navarth Wellness</p><p className="hi text-[11px] text-gold-600">{t('tagline')}</p></div>
          </div>
          <button onClick={() => setLang(lang === 'en' ? 'hi' : 'en')} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
            <Languages className="h-4 w-4" />{lang === 'en' ? 'हिंदी' : 'English'}
          </button>
        </div>
        <div className="flex flex-1 items-start justify-center px-5 pb-10 pt-4 sm:items-center sm:px-10">
          <div className={clsx('w-full', wide ? 'max-w-2xl' : 'max-w-md')}>
            {/* phones / tablets: compact slide banner (the full brand panel is shown on large screens) */}
            <div className="relative mb-6 overflow-hidden rounded-2xl bg-brand-950 shadow-md lg:hidden">
              <div className="relative aspect-video">
                {SLIDES.map((sl, k) => (
                  <img key={sl.src} src={sl.src} alt={sl.title} className={clsx('absolute inset-0 h-full w-full object-cover transition-opacity duration-700', sl.portrait && 'object-top', k === i ? 'opacity-100' : 'opacity-0')} />
                ))}
              </div>
              <div className="flex items-center justify-between gap-3 bg-brand-950 px-4 py-2.5">
                <p className="truncate text-xs font-semibold text-white">{s.title}</p>
                <div className="flex shrink-0 gap-1">{SLIDES.map((_, k) => <span key={k} className={clsx('h-1.5 rounded-full', k === i ? 'w-4 bg-gold-400' : 'w-1.5 bg-white/30')} />)}</div>
              </div>
            </div>
            {children}
          </div>
        </div>
        <p className="px-6 pb-5 text-center text-[11px] text-slate-400">© {new Date().getFullYear()} Navarth Wellness Pvt. Ltd. · Direct selling as per the Consumer Protection (Direct Selling) Rules, 2021</p>
      </main>
    </div>
  );
}
