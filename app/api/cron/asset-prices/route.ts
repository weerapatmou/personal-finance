import { NextResponse } from "next/server";
import { refreshPricesForAll } from "@/lib/portfolio/refresh-prices";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const summary = await refreshPricesForAll();
  return NextResponse.json({ ok: true, ...summary });
}
