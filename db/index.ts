import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

// Singleton connection pool. In development, hot-reloads can otherwise create
// duplicate pools and exhaust Postgres connections.
declare global {
  // eslint-disable-next-line no-var
  var __pgClient: ReturnType<typeof postgres> | undefined;
}

const client = global.__pgClient ?? postgres(connectionString, { max: 20, prepare: false });
if (process.env.NODE_ENV !== "production") global.__pgClient = client;

export const db = drizzle(client, { schema });
export { schema };
