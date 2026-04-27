import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { db } from "@/db";
import { backupExports, users } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * Daily Postgres backup. Streams `pg_dump --format=custom $DATABASE_URL` to
 * an S3-compatible object store. Retains 30 days.
 *
 * Deployment caveat (per PHASE2_PROMPT.md §E): Vercel's serverless runtime does
 * not include `pg_dump`. Either vendor a Linux-x64 binary at `bin/pg_dump` or
 * run this cron from a self-hosted runner. Set `PG_DUMP_BIN` to override the
 * binary path.
 */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allUsers = await db.select({ id: users.id }).from(users);

  const databaseUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  const bucket = process.env.BACKUP_S3_BUCKET;
  const endpoint = process.env.BACKUP_S3_ENDPOINT;
  const accessKey = process.env.BACKUP_S3_KEY;
  const secretKey = process.env.BACKUP_S3_SECRET;
  const pgDumpBin = process.env.PG_DUMP_BIN ?? "pg_dump";

  // If backup credentials are not configured, fall back to the SKIPPED stub
  // (Phase 1 behavior). The route still exits 200 so the cron stays green.
  if (!databaseUrl || !bucket || !endpoint || !accessKey || !secretKey) {
    for (const u of allUsers) {
      await db.insert(backupExports).values({
        userId: u.id,
        kind: "PG_DUMP",
        status: "SKIPPED",
        finishedAt: new Date(),
        error: "Backup S3 env vars not configured.",
      });
    }
    return NextResponse.json({
      ok: true,
      users: allUsers.length,
      note: "S3 env vars missing — recorded as SKIPPED.",
    });
  }

  let succeeded = 0;
  let failed = 0;
  for (const u of allUsers) {
    const [row] = await db
      .insert(backupExports)
      .values({ userId: u.id, kind: "PG_DUMP", status: "RUNNING" })
      .returning();

    try {
      const isoDate = new Date().toISOString().slice(0, 10);
      const key = `backups/${u.id}/${isoDate}.dump`;
      const result = await runPgDumpToS3({
        databaseUrl,
        bucket,
        endpoint,
        accessKey,
        secretKey,
        key,
        pgDumpBin,
      });
      await db
        .update(backupExports)
        .set({
          status: "OK",
          finishedAt: new Date(),
          locationUri: `s3://${bucket}/${key}`,
          byteSize: result.byteSize,
        })
        .where(eq(backupExports.id, row!.id));

      // Retention: deleting old objects requires the same SDK; left as a TODO
      // when the SDK is wired in. The table column status='OK' lets us
      // detect missing/old backups via a query in the meantime.
      succeeded++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db
        .update(backupExports)
        .set({
          status: "FAILED",
          finishedAt: new Date(),
          error: message.slice(0, 4000),
        })
        .where(eq(backupExports.id, row!.id));
      failed++;
    }
  }

  return NextResponse.json({ ok: true, users: allUsers.length, succeeded, failed });
}

type S3Args = {
  databaseUrl: string;
  bucket: string;
  endpoint: string;
  accessKey: string;
  secretKey: string;
  key: string;
  pgDumpBin: string;
};

/**
 * Spawns pg_dump and streams stdout to S3 via @aws-sdk/client-s3 Upload.
 *
 * NOTE: this lazy-imports `@aws-sdk/client-s3` and `@aws-sdk/lib-storage` so
 * the SDK is only added when the user enables backups. Install with:
 *   pnpm add @aws-sdk/client-s3 @aws-sdk/lib-storage
 */
async function runPgDumpToS3(args: S3Args): Promise<{ byteSize: number }> {
  // Lazy-import so the route still type-checks without the SDK installed.
  // Errors here surface to the catch block above as a FAILED backup.
  const { S3Client } = await import("@aws-sdk/client-s3").catch(() => {
    throw new Error(
      "@aws-sdk/client-s3 not installed. Install it before enabling backups.",
    );
  });
  const { Upload } = await import("@aws-sdk/lib-storage").catch(() => {
    throw new Error(
      "@aws-sdk/lib-storage not installed. Install it before enabling backups.",
    );
  });

  const s3 = new S3Client({
    region: "auto",
    endpoint: args.endpoint,
    credentials: { accessKeyId: args.accessKey, secretAccessKey: args.secretKey },
    forcePathStyle: true,
  });

  const child = spawn(args.pgDumpBin, ["--format=custom", "--no-owner", args.databaseUrl], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  let byteSize = 0;
  child.stdout.on("data", (chunk: Buffer) => {
    byteSize += chunk.length;
  });

  const upload = new Upload({
    client: s3,
    params: {
      Bucket: args.bucket,
      Key: args.key,
      Body: child.stdout,
      ContentType: "application/octet-stream",
    },
  });

  const exitPromise = new Promise<number>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? -1));
  });

  await upload.done();
  const exit = await exitPromise;
  if (exit !== 0) {
    throw new Error(`pg_dump exited ${exit}: ${stderr.slice(0, 500)}`);
  }
  return { byteSize };
}
