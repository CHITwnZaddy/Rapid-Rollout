# Rapid Rollout

Proposal scoping & pricing tool Rapid Rollout Sales Engineers. Replaces the legacy Excel scoping workbook with a Next.js + Supabase app that lets SEs build customer proposals, price four scenario variants (P1/P2/Opt1/Opt2), scope migration services, and export bid sheets and reports.

## Stack

- **Next.js 16.2.3** (App Router, Turbopack, RSC)
- **React 19.2**
- **Supabase** (Postgres + RLS + Auth via `@supabase/ssr`)
- **TanStack Query** for client-side caching
- **Zod** at form boundaries
- **Vitest** for unit tests
- **shadcn/ui + Tailwind v4** for UI
- **exceljs** for styled spreadsheet exports in-app (dynamic-imported to keep it out of the initial JS bundle)
- **xlsx** (dev-only) for reading `.xlsm` workbooks in `scripts/seed-lookup-data.ts`

> ⚠️ This repo pins **Next.js 16**, which has breaking changes from older versions. Read `node_modules/next/dist/docs/` before making framework-level changes. See `AGENTS.md`.

## Local setup

```bash
# 1. Install deps
npm install

# 2. Environment
cp .env.local.example .env.local
# Fill in:
#   NEXT_PUBLIC_SUPABASE_URL
#   NEXT_PUBLIC_SUPABASE_ANON_KEY
#   SUPABASE_SERVICE_ROLE_KEY  (seed script only — never commit)

# 3. Database
# Apply all migrations in supabase/migrations/ in order (001 → 00N)
# via the Supabase SQL editor or `supabase db push` if you use the CLI.

# 4. Seed lookup tables (rate cards, service hours) from the Excel workbook
npx tsx scripts/seed-lookup-data.ts --workbook /path/to/workbook.xlsx --dry-run
# drop --dry-run when you're ready to write

# 5. Dev server
npm run dev
```

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Next.js dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run start` | Run the production build |
| `npm run lint` | ESLint |
| `npm run test` | Run vitest suite once |
| `npm run test:watch` | Vitest in watch mode |

## Project layout

```
src/
  app/
    (app)/            authenticated routes (dashboard, proposals, admin, reports)
    (auth)/           login / signup
  components/
    ui/               shadcn primitives
    scenarios/        scenario grid
    migration/        migration page subcomponents
  lib/
    calculations/     pure pricing/migration math (tested)
      __tests__/      vitest suites
    supabase/         server + client + middleware helpers
    validation/       Zod schemas + parseSupabaseResult helper
    hooks/            useAuth, useRequireAdmin, etc.
    exports/          Excel (.xlsx) export builders (exceljs)
  middleware.ts       edge-level auth gate
supabase/
  migrations/         numbered SQL migrations (authoritative schema)
scripts/
  seed-lookup-data.ts workbook → Supabase seed with --dry-run / --force guards
```

## Key concepts

- **Calculation engines** (`src/lib/calculations/engine.ts`, `migration-engine.ts`) are pure functions with full vitest coverage. Prefer extending them over adding math to components.
- **Fail-closed pricing.** Rate cards MUST hydrate from Supabase before any pricing UI renders. Missing rows → error card, not hardcoded defaults.
- **RLS.** Global-read/owner-write on proposals (SEs back each other up). Customers are shared-write. Audit log has per-row `WITH CHECK (changed_by = auth.uid())` + triggers.
- **Route groups.** `(app)` vs `(auth)` cleanly split authenticated and public pages with their own layouts.

## Contributing

- Keep calculation logic in the engines, not in components.
- Validate all user input with Zod before hitting Supabase.
- Never add `force-dynamic` to a page that can use `revalidate`.
- Run `npm run test` before pushing.
