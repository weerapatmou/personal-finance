import { NextResponse } from "next/server";
import { db } from "@/db";
import { backupExports, users } from "@/db/schema";

export async function GET(req: Request) {
  // Verify the cron-secret bearer token. Vercel Cron sets this header.
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Phase 1 stub: insert a BackupExport row marked SKIPPED. The real
  // pg_dump-to-S3 implementation lands in Phase 2 (per PHASE2_PROMPT.md §E).
  const allUsers = await db.select({ id: users.id }).from(users);

  for (const u of allUsers) {
    await db.insert(backupExports).values({
      userId: u.id,
      kind: "PG_DUMP",
      status: "SKIPPED",
      finishedAt: new Date(),
      error: "Phase 1 stub. Real pg_dump body lands in Phase 2.",
    });
  }

  console.log(`[backup-cron] stub run for ${allUsers.length} users — SKIPPED`);

  return NextResponse.json({
    ok: true,
    users: allUsers.length,
    note: "Phase 1 stub. pg_dump body in Phase 2.",
  });
}
