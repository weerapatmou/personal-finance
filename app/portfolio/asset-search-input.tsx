"use client";

import { useState, useRef, useEffect } from "react";
import { Search, Loader2 } from "lucide-react";
import type { AssetSearchHit } from "@/app/api/asset-search/route";

interface Props {
  category: "stock" | "crypto";
  placeholder: string;
  // eslint-disable-next-line no-unused-vars -- TS type signature
  onSelect: (result: AssetSearchHit) => void;
}

/** Debounced autocomplete input that hits /api/asset-search. */
export function AssetSearchInput({ category, placeholder, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AssetSearchHit[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function onChange(q: string) {
    setQuery(q);
    setErrorMsg(null);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (q.trim().length < 1) {
      setResults([]);
      setOpen(false);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    timerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/asset-search?q=${encodeURIComponent(q)}&category=${category}`,
        );
        if (res.status === 429) {
          const body = (await res.json()) as { error?: string };
          setResults([]);
          setOpen(false);
          setErrorMsg(body.error ?? "Rate limited. Try again in a few minutes.");
          return;
        }
        if (!res.ok) {
          setResults([]);
          setOpen(false);
          setErrorMsg("Search failed. Try again.");
          return;
        }
        const data: AssetSearchHit[] = await res.json();
        setResults(data);
        setOpen(data.length > 0);
      } catch {
        setResults([]);
        setOpen(false);
        setErrorMsg("Network error. Try again.");
      } finally {
        setIsSearching(false);
      }
    }, 350);
  }

  return (
    <div className="relative" ref={containerRef}>
      <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
        {isSearching ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <Search className="h-4 w-4 text-muted-foreground" />
        )}
      </div>
      <input
        value={query}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
      {errorMsg && !isSearching && (
        <p className="mt-1.5 text-xs text-amber-700">{errorMsg}</p>
      )}
      {open && results.length > 0 && (
        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-border bg-background shadow-lg">
          {results.map((r) => (
            <button
              key={`${r.kind}-${r.symbol}`}
              type="button"
              onClick={() => {
                onSelect(r);
                setOpen(false);
                setQuery("");
                setResults([]);
              }}
              className="flex w-full items-center justify-between px-4 py-2.5 text-sm hover:bg-muted"
            >
              <div className="min-w-0 text-left">
                <span className="font-medium">
                  {r.kind === "crypto" ? r.ticker.toUpperCase() : r.symbol}
                </span>
                <span className="ml-2 truncate text-muted-foreground">{r.name}</span>
              </div>
              <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                {r.kind === "stock" ? `${r.exchange} · ${r.currency}` : "Crypto"}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
