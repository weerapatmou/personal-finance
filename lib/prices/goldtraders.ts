// Thai gold price (per baht weight, 99.9% purity, in THB).
//
// HISTORY: This file used to scrape goldtraders.or.th's HTML homepage.
// In 2026 they moved to a Next.js SPA that loads prices client-side via
// JS, so the homepage HTML no longer contains the price table. Rather
// than reverse-engineer the new app, we compute spot value from the
// international gold price and the live FX rate. The displayed value is
// the metal's intrinsic worth — Thai gold dealers add a small premium
// (~200–500 THB / baht weight) on top, but for portfolio tracking the
// spot value is what matters.
//
// Formula:
//   1 troy oz   = 31.1035 g
//   1 baht weight (Thai standard) = 15.244 g
//   So 1 baht weight of 99.9% gold ≈ 15.244 × 0.999 / 31.1035 troy oz
//                                  ≈ 0.48962 troy oz
//   THB per baht weight = XAU_USD_per_oz × 0.48962 × USD_THB

import { fetchGoldSpotUsd } from "./stooq";
import { fetchFxRate } from "./erapi";

const BAHT_WEIGHT_G = 15.244;
const TROY_OZ_G = 31.1035;
const PURITY_999 = 0.999;
const BAHT_WEIGHT_PER_OZ = (BAHT_WEIGHT_G * PURITY_999) / TROY_OZ_G; // ≈ 0.48962

export type GoldPrice = {
  date: string; // ISO yyyy-mm-dd
  bahtWeight999PriceTHB: number;
  source: string;
};

export async function fetchTodayGold(): Promise<GoldPrice | null> {
  const [xau, fx] = await Promise.all([
    fetchGoldSpotUsd(),
    fetchFxRate("USD", "THB"),
  ]);
  if (!xau || !fx) return null;
  const thbPerBahtWeight = xau.price * BAHT_WEIGHT_PER_OZ * fx.rate;
  return {
    date: new Date().toISOString().slice(0, 10),
    bahtWeight999PriceTHB: Math.round(thbPerBahtWeight * 100) / 100,
    source: "stooq+erapi",
  };
}
