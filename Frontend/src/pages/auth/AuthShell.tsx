import { useEffect, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight, Languages, Leaf, ShieldCheck, Truck } from 'lucide-react';
import { useT } from '@/i18n';

// Business-plan presentation (Navarth Wellness) — images in public/brand/plan/plan-01.jpg … plan-27.jpg
const PLAN: [string, string][] = [
  ['Navarth Wellness — Business Plan', 'Jiyo zindagi shaan se · www.navarthwellness.site'],
  ['About us', 'Founded on 4 August 2022 in Varanasi — vitamins, minerals and supplements for a healthier lifestyle.'],
  ['A message from our Director', 'Write your own destiny — and keep every family healthy.'],
  ['Our legal documents', 'ISO certificate, Certificate of Incorporation, TAN and PAN / bank account.'],
  ['Vision & mission', 'World-class products for a healthy, energetic life — and an India free of unemployment and illness.'],
  ['Our dreams', 'Wealth, a dream home, a luxury car, foreign travel, respect and good health.'],
  ['The root cause of disease', 'The nutrition gap — and four steps to protect your family.'],
  ['What the WHO says', 'The 11 major health problems in India today.'],
  ['Today’s diseases', 'Heart disease, diabetes, arthritis, obesity and more.'],
  ['Life then and now', 'How a few decades of lifestyle change affect a long, healthy life.'],
  ['Products for every daily need', 'Agro, oral, personal, home, nutrition, fashion, wellness, hair and eye care.'],
  ['One path to success', 'Working + non-working maha plan, plus Parivar Jeevan Suraksha.'],
  ['Joining package', 'Activate your ID with 40 BV or 100 BV (₹50 = 1 BV).'],
  ['Plan benefits', 'Retail profit, matching income and more — from a 100 BV joining.'],
  ['Pair matching made simple', 'Examples: 40 BV vs 40 BV and 40 BV vs 100 BV.'],
  ['Pair matching examples', '40 BV pairs and 100 BV pairs, explained step by step.'],
  ['Plan benefits', 'A 40 BV or 100 BV joining package makes your ID eligible for the plan incomes.'],
  ['1 · Retail profit', '10% to 40% retail profit on all Navarth Wellness products.'],
  ['2 · 40 BV matching income', 'Pair matching with daily, weekly and monthly capping.'],
  ['2 · 100 BV matching income', '1 : 1 pair matching on 100 BV.'],
  ['3 · L.R.B. — Level, Reward, Bonus', 'Level, reward and bonus for left and right BV.'],
  ['LRB second part', 'Income & reward plan — levels 8 to 17.'],
  ['4 · Income by rank', 'From Star to Brand Ambassador.'],
  ['4 · Autopool (non-working)', 'Levels 1 to 9.'],
  ['Jeevan Suraksha bonus', 'A bonus for ranks 1 to 17.'],
  ['Terms & conditions', 'Closing and payout schedule, TDS, admin charges and NEFT transfer.'],
  ['Thank you', 'Head office: Ramnagar, Bhiti, Tengara Mod, Bypass, Varanasi.'],
];
const SLIDES = PLAN.map(([title, text], k) => ({ src: `/brand/plan/plan-${String(k + 1).padStart(2, '0')}.jpg`, title, text }));
const N = SLIDES.length;

/** Only the previous, current and next slide are rendered: smooth cross-fade without loading all 27 images at once */
const near = (k: number, i: number) => k === i || k === (i + 1) % N || k === (i - 1 + N) % N;

/** Split-screen brand panel used by Login / Register / Forgot password */
export default function AuthShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  const [i, setI] = useState(0);
  const { lang, setLang, t } = useT();
  useEffect(() => {
    const id = setInterval(() => setI((x) => (x + 1) % N), 5500);
    return () => clearInterval(id);
  }, [i]); // restarts the timer after a manual change
  const go = (d: number) => setI((x) => (x + d + N) % N);
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
              <div className="relative aspect-[4/3] w-full">
                {SLIDES.map((sl, k) => near(k, i) && (
                  <a key={sl.src} href={sl.src} target="_blank" rel="noreferrer" tabIndex={k === i ? 0 : -1} aria-hidden={k !== i} title="Open full size"
                    className={clsx('absolute inset-0 transition-opacity duration-700', k === i ? 'opacity-100' : 'pointer-events-none opacity-0')}>
                    <img src={sl.src} alt={sl.title} className="h-full w-full object-contain" />
                  </a>
                ))}
                <button type="button" onClick={() => go(-1)} aria-label="Previous slide" className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-1.5 text-white backdrop-blur hover:bg-black/60"><ChevronLeft className="h-5 w-5" /></button>
                <button type="button" onClick={() => go(1)} aria-label="Next slide" className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-1.5 text-white backdrop-blur hover:bg-black/60"><ChevronRight className="h-5 w-5" /></button>
              </div>
            </div>
            <div className="mt-6 min-h-[72px]">
              <p key={s.title} className="animate-fade-in text-xl font-bold text-white">{s.title}</p>
              <p key={s.text} className="animate-fade-in mt-1 text-sm text-brand-100/80">{s.text}</p>
            </div>
            <div className="mt-2 flex items-center gap-3">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15">
                <div className="h-full rounded-full bg-gold-400 transition-all duration-500" style={{ width: `${((i + 1) / N) * 100}%` }} />
              </div>
              <span className="text-xs font-semibold tabular-nums text-brand-100/80">{i + 1} / {N}</span>
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
                {SLIDES.map((sl, k) => near(k, i) && (
                  <img key={sl.src} src={sl.src} alt={k === i ? sl.title : ''} onClick={() => go(1)}
                    className={clsx('absolute inset-0 h-full w-full cursor-pointer object-contain transition-opacity duration-700', k === i ? 'opacity-100' : 'opacity-0')} />
                ))}
              </div>
              <div className="flex items-center justify-between gap-3 bg-brand-950 px-4 py-2.5">
                <p className="truncate text-xs font-semibold text-white">{s.title}</p>
                <div className="flex shrink-0 items-center gap-1 text-white">
                  <button type="button" onClick={() => go(-1)} aria-label="Previous slide" className="rounded p-0.5 hover:bg-white/10"><ChevronLeft className="h-4 w-4" /></button>
                  <span className="text-[11px] font-semibold tabular-nums text-white/80">{i + 1}/{N}</span>
                  <button type="button" onClick={() => go(1)} aria-label="Next slide" className="rounded p-0.5 hover:bg-white/10"><ChevronRight className="h-4 w-4" /></button>
                </div>
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
