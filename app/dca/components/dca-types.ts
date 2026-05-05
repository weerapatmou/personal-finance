import type { Currency } from "@/lib/money";

export type Timeframe = "7D" | "30D" | "60D" | "90D" | "180D" | "1Y" | "2Y" | "4Y" | "ALL";
export type ChartMode = "portfolio" | "pnl" | "cost" | "units" | "entries";

export type SerializedEntry = {
  id: string;
  date: string;
  fiatAmount: string;
  fiatCurrency: Currency;
  units: string;
  unitPrice: string;
  note: string | null;
};

export type SerializedEnriched = {
  id: string;
  date: string;
  dayActive: number;
  fiatCurrency: Currency;
  units: string;
  unitPrice: string;
  note: string | null;
  fiatAmountDisplay: string;
  unitPriceDisplay: string;
  cumUnits: string;
  cumFiatDisplay: string;
  portfolioValueDisplay: string;
  unrealizedDisplay: string;
  pctUnrealized: string;
};

export type SerializedSummary = {
  spendDisplay: string;
  totalUnits: string;
  numberOfDays: number;
  averageCostDisplay: string;
  marketValueDisplay: string;
  pctProfitLoss: string;
  maxDrawdownPct: string;
  worstEntryLossPct: string;
  worstEntryLossDisplay: string;
  worstEntryDate: string;
  bestEntryGainPct: string;
  bestEntryDate: string;
  progressFiatPct: string;
  progressUnitsPct: string;
  currentPriceDisplay: string;
  goalFiatDisplay: string;
  goalUnits: string;
};

export type SerializedSettings = {
  theme: "light" | "dark";
  accent: string;
  graphRange: Timeframe;
  goalFiat: string | null;
  goalFiatCurrency: Currency;
  goalUnits: string | null;
};

export type Accent = {
  name: string;
  hex: string;
  strong: string;
  soft: string;
  line: string;
};

export const ACCENTS: Accent[] = [
  {
    name: "orange",
    hex: "#F2A900",
    strong: "#E89100",
    soft: "#FFF4DC",
    line: "rgba(242,169,0,0.15)",
  },
  {
    name: "saffron",
    hex: "#E77B1D",
    strong: "#C86511",
    soft: "#FCE9D6",
    line: "rgba(231,123,29,0.15)",
  },
  {
    name: "amber",
    hex: "#D98F1C",
    strong: "#B37416",
    soft: "#FBEBCF",
    line: "rgba(217,143,28,0.15)",
  },
  {
    name: "crimson",
    hex: "#C84A3F",
    strong: "#A33A2F",
    soft: "#F5DCD8",
    line: "rgba(200,74,63,0.15)",
  },
  {
    name: "forest",
    hex: "#2E7D5B",
    strong: "#24634A",
    soft: "#D9EBDF",
    line: "rgba(46,125,91,0.15)",
  },
  {
    name: "indigo",
    hex: "#2B3A66",
    strong: "#1F2B4D",
    soft: "#DBE0EE",
    line: "rgba(43,58,102,0.15)",
  },
];
