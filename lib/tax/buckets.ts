import Decimal from "decimal.js";
import type { TaxTreatment } from "@/lib/types";

export type TaxYearInputs = {
  assessableIncome: Decimal;
  contributions: TaxContribution[];
};

export type TaxContribution = {
  /** Effective tax_treatment after BudgetLine override / Category default. */
  taxTreatment: TaxTreatment;
  /** Optional categoryNameTh; used to disambiguate RMF vs SSF vs PF inside PIT_DEDUCT. */
  categoryNameTh?: string;
  amount: Decimal;
  date: string; // for tax year filtering
};

export type BucketResult = {
  key: BucketKey;
  label: string;
  used: Decimal;
  cap: Decimal | null;
  capFormula: string;
  warning?: string;
};

export type BucketKey = "PF_OWN" | "RMF" | "SSF" | "DONATION_GENERAL" | "SSO" | "OTHER_PIT_DEDUCT";

const COMBINED_RETIREMENT_CAP = new Decimal(500_000); // RMF + SSF + PF + others combined

/**
 * Compute the per-bucket totals and caps for a tax year. Cap interpretations
 * follow the Thai Revenue Department's published rules circa 2024.
 *
 * The combined ฿500,000 cap is enforced by the caller via `combinedWarning`
 * on the result.
 */
export function computeBuckets(input: TaxYearInputs): {
  buckets: BucketResult[];
  combinedRetirement: Decimal;
  combinedRetirementCap: Decimal;
  combinedWarning?: string;
} {
  const { assessableIncome, contributions } = input;

  const sumWhere = (predicate: (_c: TaxContribution) => boolean) =>
    contributions.filter(predicate).reduce((s, c) => s.plus(c.amount), new Decimal(0));

  const pfOwn = sumWhere((c) => c.taxTreatment === "PF_CONTRIB");
  const sso = sumWhere((c) => c.taxTreatment === "SSO_CONTRIB");
  const rmf = sumWhere(
    (c) =>
      c.taxTreatment === "PIT_DEDUCT" &&
      !!c.categoryNameTh &&
      /RMF/i.test(c.categoryNameTh),
  );
  const ssf = sumWhere(
    (c) =>
      c.taxTreatment === "PIT_DEDUCT" &&
      !!c.categoryNameTh &&
      /SSF/i.test(c.categoryNameTh),
  );
  const donations = sumWhere(
    (c) =>
      c.taxTreatment === "PIT_DEDUCT" &&
      !!c.categoryNameTh &&
      /(บุญ|donation)/i.test(c.categoryNameTh),
  );
  const otherPit = sumWhere(
    (c) =>
      c.taxTreatment === "PIT_DEDUCT" &&
      !(
        c.categoryNameTh &&
        /(RMF|SSF|บุญ|donation)/i.test(c.categoryNameTh)
      ),
  );

  const buckets: BucketResult[] = [
    {
      key: "PF_OWN",
      label: "Provident Fund (own contribution)",
      used: pfOwn,
      cap: Decimal.min(assessableIncome.times("0.15"), COMBINED_RETIREMENT_CAP),
      capFormula: "min(15% × income, ฿500,000 combined cap)",
    },
    {
      key: "RMF",
      label: "RMF",
      used: rmf,
      cap: Decimal.min(assessableIncome.times("0.30"), COMBINED_RETIREMENT_CAP),
      capFormula: "min(30% × income, ฿500,000 combined cap)",
    },
    {
      key: "SSF",
      label: "SSF",
      used: ssf,
      cap: Decimal.min(assessableIncome.times("0.30"), new Decimal(200_000)),
      capFormula: "min(30% × income, ฿200,000)",
    },
    {
      key: "DONATION_GENERAL",
      label: "Donations (general)",
      used: donations,
      cap: assessableIncome.times("0.10"),
      capFormula: "10% × income (after other deductions)",
    },
    {
      key: "SSO",
      label: "Social Security",
      used: sso,
      cap: new Decimal(9_000), // ฿750/mo × 12
      capFormula: "฿750/month × 12 = ฿9,000",
    },
    {
      key: "OTHER_PIT_DEDUCT",
      label: "Other PIT-deductible",
      used: otherPit,
      cap: null,
      capFormula: "varies by category",
    },
  ];

  for (const b of buckets) {
    if (b.cap && b.used.greaterThan(b.cap)) {
      b.warning = `Used ${b.used.toFixed(0)} exceeds cap ${b.cap.toFixed(0)}`;
    }
  }

  const combinedRetirement = pfOwn.plus(rmf).plus(ssf).plus(otherPit);
  let combinedWarning: string | undefined;
  if (combinedRetirement.greaterThan(COMBINED_RETIREMENT_CAP)) {
    combinedWarning = `Combined retirement contributions (${combinedRetirement.toFixed(0)}) exceed the ฿500,000 cap`;
  }

  return {
    buckets,
    combinedRetirement,
    combinedRetirementCap: COMBINED_RETIREMENT_CAP,
    combinedWarning,
  };
}
