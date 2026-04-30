# Reporting performance baseline

## Purpose

Capture the first measured baseline after centralizing report data calls in
`src/lib/reports/data.ts`.

Use this file to decide the next report work by request count and payload shape,
not by a single page-load feeling. The timing numbers are still useful, but this
dataset is small enough that browser and network noise can move them around.

## Current setup

| Environment | Data source | Notes |
| --- | --- | --- |
| Local dev | Staging Supabase | `.env.local` points local app traffic at staging |
| Production | Production Supabase | Live app and live data |

Staging lookup data was backfilled from production for these reference tables:

| Table | Staging rows after backfill |
| --- | ---: |
| `rate_cards` | 14 |
| `service_hours` | 156 |

No proposal, scenario, bid sheet, or other transactional production data was
copied into staging.

## Manual network measurements

Measured in Chrome DevTools Network panel with `supabase` in the filter box.

| Report | Local/staging requests | Local/staging transfer | Local/staging resources | Local/staging time | Production requests | Production transfer | Production resources | Production time |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Proposal Log | 7 | 7.3 kB | 5.6 kB | ~225 ms | 14 | 8.1 kB | 12.1 kB | ~225 ms |
| Scenario Breakout | 12 | 7.0 kB | 11.6 kB | ~250 ms | 12 | 6.9 kB | 11.5 kB | ~200 ms |
| Proposal Hours | 11 | 7.8 kB | 12.3 kB | ~275 ms | 11 | 8.7 kB | 24.9 kB | ~240 ms |
| Portfolio Value | 8 | 7.4 kB | 5.7 kB | ~225 ms | 10 | 7.8 kB | 11.3 kB | ~350 ms |
| Stale Proposals | 3 | 1.8 kB | 210 B | ~160 ms | 3 | 2.2 kB | 1.2 kB | ~200 ms |
| Time to Close | 3 | 1.8 kB | 210 B | ~150 ms | 3 | 2.2 kB | 1.2 kB | ~160 ms |

## Read

The Phase 1 refactor helped the data-access shape.

Best signal:

| Report | Signal |
| --- | --- |
| Proposal Log | Strong request-count drop in local/staging compared with production |
| Portfolio Value | Smaller request-count drop |
| Scenario Breakout | No change expected; Phase 1 intentionally left this report alone |
| Proposal Hours | Same request count; still fetches several child-row groups |
| Stale Proposals | Already lean by request count |
| Time to Close | Already lean by request count |

The timing numbers are too close together to use as proof by themselves. The
request counts are the cleaner signal.

## Phase 3 candidates

Recommended order:

| Priority | Candidate | Why |
| ---: | --- | --- |
| 1 | Proposal Log report totals | Highest request-count drop after Phase 1 and broadest leadership-facing report |
| 2 | Portfolio Value totals | Similar revenue aggregate shape, smaller report surface |
| 3 | Proposal Hours totals | Same 11-request shape after Phase 1; likely to grow with proposal volume |
| 4 | Scenario Breakout | High request count, but proposal-specific and already intentionally isolated |
| 5 | Stale Proposals / Time to Close | Low request count today; defer until status-history volume becomes visible |

## Recommended next move

Plan Phase 3 around a shared database-side report totals source for revenue
reports first.

Target behavior:

- Keep the existing report UI and export output the same.
- Move repeated proposal total aggregation closer to Postgres.
- Return one shaped row per proposal for revenue reports where possible.
- Keep RLS behavior intact.
- Verify against staging before any production migration.

Schema work requires explicit approval before merge or production promotion.
