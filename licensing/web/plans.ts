// LexiCore Web (V7.1) — subscription plans, priced in Rupiah.
//
// Prices below are PLACEHOLDERS — set the real numbers before launch.
// Nothing else in the licensing logic depends on the actual price; change
// freely.

import type { SubscriptionPricingIDR } from '../core/types';

export const PLANS: Record<'DAY' | 'WEEK' | 'MONTH', SubscriptionPricingIDR> = {
  DAY: {
    plan: 'DAY',
    label: 'Harian',
    durationMs: 24 * 60 * 60 * 1000,
    priceIDR: 15_000,
  },
  WEEK: {
    plan: 'WEEK',
    label: 'Mingguan',
    durationMs: 7 * 24 * 60 * 60 * 1000,
    priceIDR: 75_000,
  },
  MONTH: {
    plan: 'MONTH',
    label: 'Bulanan',
    durationMs: 30 * 24 * 60 * 60 * 1000,
    priceIDR: 250_000,
  },
};

export const DEMO_DURATION_MS = 3 * 24 * 60 * 60 * 1000; // 3-day free trial, adjust as needed

export function formatIDR(amount: number): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(
    amount
  );
}
