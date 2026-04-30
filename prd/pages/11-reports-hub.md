# Reports Hub

> **Route:** `/reports`  
> **Module:** Reports  
> **Generated:** 2026-04-30

## Overview

Landing page listing **six reports** as cards with title, description, and **Run Report →** affordance linking to each route.

## Layout

- Title **Reports**.
- Responsive grid of linked cards (two columns on small+ breakpoints).

## Catalog entries

| Title | Route | Summary (as shown) |
|-------|---------|-------------------|
| Proposal Log | `/reports/proposal-log` | All proposals summary with filters; export |
| Scenario Breakout | `/reports/scenario-breakout` | Single proposal deep breakout |
| Proposal Hours | `/reports/proposal-hours` | Hours by role across scenarios/scoped/migration |
| Portfolio Value | `/reports/portfolio-value` | Pipeline by status; defaults to mine; excludes Lost/VOID unless opted in |
| Stale Proposals | `/reports/stale-proposals` | In-flight aging; red when >21 days |
| Time to Close | `/reports/time-to-close` | Sent→close velocity; red when >30 days |

## Interactions

- Pure navigation — no server data on hub.

## Page relationships

- **Inbound:** Sidebar **Reports**.
- **Outbound:** Individual report routes.

## Business rules

- Descriptions should stay aligned with implemented thresholds when product marketing copy changes.
