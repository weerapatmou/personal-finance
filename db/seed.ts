import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, and } from "drizzle-orm";
import * as schema from "./schema";

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_URL (or DIRECT_URL) before seeding.");
  process.exit(1);
}

const seedEmail = process.env.SEED_EMAIL ?? process.env.ALLOWED_EMAIL;
const seedName = process.env.SEED_NAME ?? "Owner";
if (!seedEmail) {
  console.error("Set SEED_EMAIL (or ALLOWED_EMAIL) before seeding.");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });
const db = drizzle(sql, { schema });

// ─── User ────────────────────────────────────────────────────────────────────
const existingUser = await db.query.users.findFirst({ where: eq(schema.users.email, seedEmail) });
const user =
  existingUser ??
  (
    await db
      .insert(schema.users)
      .values({ email: seedEmail, name: seedName })
      .returning()
  )[0];
console.log(`✔ user: ${user.email} (${user.id})`);

// ─── Accounts ────────────────────────────────────────────────────────────────
type SeedAccount = {
  name: string;
  type: (typeof schema.accountTypeEnum.enumValues)[number];
  currency: string;
  sortOrder: number;
};

const accountSeeds: SeedAccount[] = [
  { name: "Dime — Stock (USD)", type: "BROKERAGE", currency: "USD", sortOrder: 1 },
  { name: "Binance TH — Crypto", type: "WALLET", currency: "USD", sortOrder: 2 },
  { name: "Binance TH — Cash (THB)", type: "WALLET", currency: "THB", sortOrder: 3 },
  { name: "Dime — Cash (USD)", type: "CHECKING", currency: "USD", sortOrder: 4 },
  { name: "Dime FCD — Emergency Fund", type: "EMERGENCY", currency: "USD", sortOrder: 5 },
  { name: "MTS-GOLD 99.9%", type: "GOLD_VAULT", currency: "THB", sortOrder: 6 },
  { name: "Accenture PF", type: "PF", currency: "THB", sortOrder: 7 },
];

for (const a of accountSeeds) {
  const exists = await db.query.accounts.findFirst({
    where: and(eq(schema.accounts.userId, user.id), eq(schema.accounts.name, a.name)),
  });
  if (!exists) {
    await db.insert(schema.accounts).values({ ...a, userId: user.id });
  }
}
console.log(`✔ accounts (${accountSeeds.length})`);

// ─── Categories ──────────────────────────────────────────────────────────────
type SeedCategory = {
  topic: (typeof schema.topicEnum.enumValues)[number];
  nameTh: string;
  nameEn: string;
  taxTreatment?: (typeof schema.taxTreatmentEnum.enumValues)[number];
  sortOrder: number;
};

const categorySeeds: SeedCategory[] = [
  // FIX
  { topic: "FIX", nameTh: "ค่าผ่อนรถยนต์", nameEn: "Car Loan", sortOrder: 1 },
  { topic: "FIX", nameTh: "ค่าประกัน + ซ่อมรถยนต์", nameEn: "Car Insurance & Repair", sortOrder: 2 },
  { topic: "FIX", nameTh: "ค่าโทรศัพท์", nameEn: "Phone", sortOrder: 3 },
  { topic: "FIX", nameTh: "ค่า Internet", nameEn: "Internet", sortOrder: 4 },
  { topic: "FIX", nameTh: "ค่า Subscription", nameEn: "Subscriptions", sortOrder: 5 },
  { topic: "FIX", nameTh: "ค่า Youtube Premium, iCloud", nameEn: "YouTube Premium & iCloud", sortOrder: 6 },
  { topic: "FIX", nameTh: "ค่าเช่า Condo", nameEn: "Condo Rent", sortOrder: 7 },

  // VARIABLE
  { topic: "VARIABLE", nameTh: "ค่าน้ำมัน", nameEn: "Gas", sortOrder: 1 },
  { topic: "VARIABLE", nameTh: "ค่าเดินทางสาธารณะ ค่าทางด่วน", nameEn: "Public Transport / Tolls", sortOrder: 2 },
  { topic: "VARIABLE", nameTh: "ค่าน้ำ", nameEn: "Water", sortOrder: 3 },
  { topic: "VARIABLE", nameTh: "ค่าไฟ", nameEn: "Electricity", sortOrder: 4 },
  { topic: "VARIABLE", nameTh: "ค่าอาหาร", nameEn: "Food", sortOrder: 5 },
  { topic: "VARIABLE", nameTh: "ค่าอาหาร Nestle", nameEn: "Nestle Food", sortOrder: 6 },
  { topic: "VARIABLE", nameTh: "ค่าอาหารมื้อพิเศษ", nameEn: "Special Meal", sortOrder: 7 },
  { topic: "VARIABLE", nameTh: "ค่าของใช้ใน Condo", nameEn: "Condo Supplies", sortOrder: 8 },
  { topic: "VARIABLE", nameTh: "ค่าเครื่องแต่งตัว/สำอาง/บำรุงหน้า", nameEn: "Clothing & Cosmetics", sortOrder: 9 },
  { topic: "VARIABLE", nameTh: "ของรางวัลให้ตัวเอง", nameEn: "Personal Reward", sortOrder: 10 },
  { topic: "VARIABLE", nameTh: "ค่าใช้จ่ายพิเศษ", nameEn: "Special Expense", sortOrder: 11 },

  // INVESTMENT
  { topic: "INVESTMENT", nameTh: "Invest ระยะสั้น", nameEn: "Short-Term Investment", sortOrder: 1 },
  { topic: "INVESTMENT", nameTh: "Invest ระยะกลาง", nameEn: "Medium-Term Investment", sortOrder: 2 },
  { topic: "INVESTMENT", nameTh: "Invest ระยะยาว", nameEn: "Long-Term Investment", sortOrder: 3 },

  // TAX
  { topic: "TAX", nameTh: "ภาษีทั่วไป", nameEn: "General Tax", sortOrder: 1 },
];

for (const c of categorySeeds) {
  const exists = await db.query.categories.findFirst({
    where: and(
      eq(schema.categories.userId, user.id),
      eq(schema.categories.topic, c.topic),
      eq(schema.categories.nameTh, c.nameTh),
    ),
  });
  if (!exists) {
    await db.insert(schema.categories).values({
      userId: user.id,
      topic: c.topic,
      nameTh: c.nameTh,
      nameEn: c.nameEn,
      taxTreatment: c.taxTreatment ?? "NONE",
      sortOrder: c.sortOrder,
    });
  }
}
console.log(`✔ categories (${categorySeeds.length})`);

// ─── Category aliases (legacy typo map) ──────────────────────────────────────
const nestleFood = await db.query.categories.findFirst({
  where: and(
    eq(schema.categories.userId, user.id),
    eq(schema.categories.nameTh, "ค่าอาหาร Nestle"),
  ),
});

if (nestleFood) {
  const aliasExists = await db.query.categoryAliases.findFirst({
    where: and(
      eq(schema.categoryAliases.userId, user.id),
      eq(schema.categoryAliases.rawItemName, "ค่าอาหาร Neslte"),
    ),
  });
  if (!aliasExists) {
    await db.insert(schema.categoryAliases).values({
      userId: user.id,
      rawTopic: "Variable Cost",
      rawCategory: null,
      rawItemName: "ค่าอาหาร Neslte",
      categoryId: nestleFood.id,
      itemNameTh: "ค่าอาหาร Nestle",
    });
  }
}
console.log("✔ category aliases (Neslte → Nestle)");

await sql.end();
console.log("\nSeed complete.");
