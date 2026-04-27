# Personal Finance Tracker

Single-user replacement for a 2+ year-old Excel workbook. Tracks monthly
expense/income ledger, multi-currency portfolio, retirement projection,
Thai tax planning, and historical net worth.

Stack: Next.js 15 (App Router) + TypeScript strict + Drizzle ORM (Postgres) +
Auth.js (magic-link) + Tailwind + Recharts + next-intl + Vitest.

## Status

**Phase 1 — Foundation**. Schema, auth, and the money/cost-basis utilities are in
place. The real UI ships in Phase 2+. See `PHASE{N}_PROMPT.md` for the build plan
and `SPEC.md` for the canonical data model.

## Required env vars

Copy `.env.example` → `.env.local` and fill in:

| Var | Example | Read by |
|---|---|---|
| `DATABASE_URL` | `postgres://user:pass@host:5432/finance` | App + Drizzle pool |
| `DIRECT_URL` | same as above (no pgbouncer) | Migrations + seed |
| `AUTH_SECRET` | `openssl rand -base64 32` | Auth.js |
| `AUTH_URL` | `http://localhost:3000` | Auth.js (prod only required) |
| `EMAIL_SERVER` | `smtp://resend:<key>@smtp.resend.com:465` | Magic-link |
| `EMAIL_FROM` | `finance@yourdomain.com` | Magic-link |
| `ALLOWED_EMAIL` | `you@example.com` | Sign-in allowlist |
| `SEED_EMAIL` | `you@example.com` | `db:seed` |
| `SEED_NAME` | `Your Name` | `db:seed` |
| `CRON_SECRET` | long random string | Cron routes |
| `BACKUP_S3_*` | (filled in Phase 2) | Backup cron |
| `OVER_BUDGET_THRESHOLD_PCT` | `10` | Phase 2 highlight rule |

## Local dev

```sh
pnpm install
cp .env.example .env.local       # then edit
pnpm db:generate                  # produce SQL from schema.ts (already generated)
pnpm db:migrate                   # apply migrations
pnpm db:seed                      # idempotent seed
pnpm dev                          # http://localhost:3000
```

Sign in with the email matching `ALLOWED_EMAIL`. Any other email is rejected at
the sign-in callback.

## Tests, typecheck, lint

```sh
pnpm typecheck
pnpm test
pnpm lint
pnpm db:check        # drizzle-kit migration drift check
```

## Deploy (Vercel + Supabase)

1. Provision a Postgres in [Supabase](https://supabase.com/docs/guides/database).
   Copy the pooled `DATABASE_URL` and the direct `DIRECT_URL`.
2. Create an SMTP provider account (e.g.
   [Resend](https://resend.com/docs/dashboard/emails/send-test-email)) and grab
   an API key for `EMAIL_SERVER`.
3. Push to GitHub, connect to [Vercel](https://vercel.com/docs/getting-started-with-vercel),
   and set every env var listed above in the project settings.
4. After deploy, run `pnpm db:migrate` and `pnpm db:seed` against the production
   database from your laptop (or via a Vercel CLI one-off). Vercel Cron will
   automatically pick up `vercel.json`.

## Layout

```
finance-app/
├── app/                    Next.js App Router pages and routes
│   ├── api/auth/...        Auth.js handler
│   ├── api/cron/backup     Daily backup (stubbed in Phase 1)
│   ├── login/              Magic-link form
│   └── page.tsx            Phase 1 placeholder home
├── components/             Shared UI components
├── db/
│   ├── schema.ts           Drizzle tables — see SPEC.md §2
│   ├── migrate.ts          Programmatic migrate runner
│   ├── seed.ts             Idempotent seed
│   └── migrations/         Generated SQL (drizzle-kit)
├── i18n/, messages/        next-intl config + translations
├── lib/
│   ├── auth.ts             Auth.js config
│   ├── env.ts              Zod-validated env
│   ├── money.ts            Money + FX utilities (Decimal-based)
│   └── cost-basis.ts       SPEC §4 replay()
├── middleware.ts           Session-protected route guard
├── tests/                  Vitest suites
├── CLAUDE.md               System rules for Claude Code
├── SPEC.md                 Canonical data model + business rules
└── PHASE{N}_PROMPT.md      Per-phase build plans
```
