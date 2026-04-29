import { config } from "dotenv";
// Load .env.local first (Next.js convention), then fall back to .env.
config({ path: ".env.local" });
config();
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_URL (or DIRECT_URL) before running migrations.");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });
const db = drizzle(sql);

await migrate(db, { migrationsFolder: "./db/migrations" });
console.log("✔ migrations applied");
await sql.end();
