import { prisma } from './prisma';

export interface PlanSettings {
  pairRates: { FULL_FULL: number; DEFAULT: number };
  caps: { day: number; week: number; month: number };
  capOverflow: 'FLUSH' | 'CARRY';
  specialBonus: { amount: number; fromRankId: number };
  deductions: { tdsPercent: number | null; adminChargePercent: number };
  withdrawal: { minAmount: number; allowedDays: string[]; enforceDays: boolean };
  placement: { mode: string };
  coolingOffDays: number;
  payoutAlertPercent: number;
  makerChecker: boolean;
  features: Record<string, boolean>;
  autopool: AutopoolSettings;
  [k: string]: unknown;
}

export interface AutopoolLevel {
  level: number;        // 1..9
  income: number;       // ₹ paid once when this level is complete
  conditionBv: number;  // repurchase BV the member must have on their own ID
}
export interface AutopoolSettings {
  /** CUMULATIVE: level n needs the SUM of the level 1..n conditions (a fresh repurchase per level).
   *  THRESHOLD: level n needs total repurchase BV >= the level n figure. */
  conditionMode: 'CUMULATIVE' | 'THRESHOLD';
  /** Put a member in the pool automatically when their joining package is paid */
  autoEnterOnActivation: boolean;
  levels: AutopoolLevel[];
}

/** From the "आटोपुल नॉनवर्किंग – 1 से 9 तक" plan sheet: team 4^n, ₹100 per position, repurchase BV doubles each level. */
export const DEFAULT_AUTOPOOL: AutopoolSettings = {
  conditionMode: 'CUMULATIVE',
  autoEnterOnActivation: true,
  levels: [
    { level: 1, income: 400, conditionBv: 20 },
    { level: 2, income: 1600, conditionBv: 40 },
    { level: 3, income: 6400, conditionBv: 80 },
    { level: 4, income: 25600, conditionBv: 160 },
    { level: 5, income: 102400, conditionBv: 320 },
    { level: 6, income: 409600, conditionBv: 640 },
    { level: 7, income: 1638400, conditionBv: 1280 },
    { level: 8, income: 6553600, conditionBv: 2560 },
    { level: 9, income: 26214400, conditionBv: 5120 },
  ],
};

export const DEFAULT_SETTINGS: PlanSettings = {
  pairRates: { FULL_FULL: 400, DEFAULT: 200 },
  caps: { day: 30, week: 210, month: 840 },
  capOverflow: 'FLUSH',
  specialBonus: { amount: 200000, fromRankId: 8 },
  deductions: { tdsPercent: null, adminChargePercent: 0 },
  withdrawal: { minAmount: 500, allowedDays: ['MON', 'THU'], enforceDays: false },
  placement: { mode: 'SPONSOR_CHOOSES_SIDE_EXTREME' },
  coolingOffDays: 30,
  payoutAlertPercent: 50,
  makerChecker: true,
  features: {
    retailProfitReport: true,
    leadershipBonus: false,
    royaltyCto: false,
    levelReward: false,
    jeevanSuraksha: false,
    autopool: false,
    directReturnViaCto: false,
  },
  autopool: DEFAULT_AUTOPOOL,
};

export async function getSettings(): Promise<{ version: number; values: PlanSettings }> {
  const row = await prisma.planSetting.findFirst({ where: { effectiveFrom: { lte: new Date() } }, orderBy: { version: 'desc' } });
  const v = (row?.values ?? {}) as Partial<PlanSettings>;
  return {
    version: row?.version ?? 0,
    values: {
      ...DEFAULT_SETTINGS,
      ...v,
      pairRates: { ...DEFAULT_SETTINGS.pairRates, ...v.pairRates },
      caps: { ...DEFAULT_SETTINGS.caps, ...v.caps },
      deductions: { ...DEFAULT_SETTINGS.deductions, ...v.deductions },
      withdrawal: { ...DEFAULT_SETTINGS.withdrawal, ...v.withdrawal },
      specialBonus: { ...DEFAULT_SETTINGS.specialBonus, ...v.specialBonus },
      features: { ...DEFAULT_SETTINGS.features, ...v.features },
      autopool: {
        ...DEFAULT_AUTOPOOL,
        ...v.autopool,
        levels: v.autopool?.levels?.length ? v.autopool.levels : DEFAULT_AUTOPOOL.levels,
      },
    },
  };
}
