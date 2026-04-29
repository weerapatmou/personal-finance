import { auth } from "@/lib/auth";
import yahooFinanceTyped from "yahoo-finance2";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const yahooFinance = yahooFinanceTyped as any;

export type SymbolSearchResult = {
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  quoteType: string;
};

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json([], { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  if (q.length < 1) return Response.json([]);

  try {
    const result = await yahooFinance.search(q, {
      newsCount: 0,
      quotesCount: 10,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const quotes: any[] = result?.quotes ?? [];
    const filtered = quotes.filter((r) => r.symbol && (r.shortname || r.longname));
    return Response.json(
      filtered.slice(0, 8).map(
        (r): SymbolSearchResult => ({
          symbol: r.symbol as string,
          name: (r.shortname ?? r.longname ?? r.symbol) as string,
          exchange: (r.exchange ?? "") as string,
          currency: (r.currency ?? "USD") as string,
          quoteType: (r.quoteType ?? "EQUITY") as string,
        }),
      ),
    );
  } catch {
    return Response.json([]);
  }
}
