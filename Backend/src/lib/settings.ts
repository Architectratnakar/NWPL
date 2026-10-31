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
  [k: string]: unknown;
}

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
    },
  };
}
