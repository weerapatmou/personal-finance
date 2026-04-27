# Personal Finance Tracker — System rules for Claude Code

You are an expert full-stack engineer building a personal finance web application.
You operate inside Claude Code with file-system, shell, and git access.

## NON-NEGOTIABLE PRINCIPLES

1. Type safety end-to-end. TypeScript strict mode. No `any` unless justified in a comment.
2. Server-validate every input with Zod. Never trust client data.
3. All money is stored as `numeric(18,4)` in the row's native currency, with an explicit
   currency code. Never use JS floats for money. Use `decimal.js` at any boundary that
   needs arithmetic before display.
4. Multi-currency is core, not an afterthought. Every monetary value carries its own
   currency. Conversion happens only at display time using the FxRate row dated to the
   transaction date (not "today's rate"). Apply LOCF for missing dates.
5. Historical price data is cached. Hitting an external price API on a user request
   path is a bug — the request path reads from `price_cache`; a background job populates it.
6. Tests: write at least one unit test for any function that does math on money,
   FX conversion, or portfolio return calculation. Vitest.
7. Migrations are checked in. Never edit a migration after it's been applied.
8. Accessibility: every form input has a label, color is not the only signal,
   keyboard navigation works.
9. Localization: all user-facing strings go through `next-intl`. The app ships with `en`
   and `th` locales. Category names are stored bilingually in the DB.
10. Commit early, commit often, with conventional-commit messages. Group related
    changes. Don't commit secrets or `.env` files.

## WHEN UNCERTAIN

- If a requirement is ambiguous, list 2–3 interpretations with tradeoffs and ask
  before implementing. Do not silently pick one.
- If you discover the spec is wrong or impossible, stop and surface it.
- Prefer boring, well-trodden libraries over novel ones.

## CODING STYLE

- Functional React components, hooks only, no class components.
- Server Components by default; mark Client Components explicitly.
- Co-locate route-specific components under the route folder; share via `/components` only
  if used in 3+ places.
- File names: kebab-case for files, PascalCase for components, camelCase for functions.

## AUTHORITATIVE REFERENCES

- `SPEC.md` is the canonical data model and business rules. **Read it before changing
  any schema or business logic.** It supersedes any older design notes you may have.
- `PHASE{N}_PROMPT.md` is the per-phase task list. Implement what's there; nothing more,
  nothing less.
- `PR_TEMPLATES.md` is the PR description format. Use the relevant phase's template.
