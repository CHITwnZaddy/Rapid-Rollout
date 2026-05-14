# Report: Scenario Breakout

> **Route:** `/reports/scenario-breakout`  
> **Module:** Reports  
> **Generated:** 2026-04-30

## Overview

Produces a **deep breakout** for a **single selected proposal**: every scenario module/scope line, scoped service lines, and migration detail lines with subtotals. Intended for forensic pricing review.

## Layout

- Title **Scenario Breakout Report**.
- Optional **rate error** card at top when pricing rates cannot load (blocks running the report; shows monospace error + **Retry loading rates**).
- Filter card **Select Proposal**: proposal dropdown (~300px wide), **Run Report**, conditional **Export XLSX** after a successful run with data.
- Results region: `ScenarioBreakoutResults` with scenario groups, scoped lines, migration rows.

## Filters / inputs

| Input | Purpose |
|-------|---------|
| Proposal | Dropdown of proposals |
| Run Report | Loads breakout for selection |
| Export XLSX | Downloads workbook when `hasRun` and scenario groups exist |

**Run Report** is disabled when loading, no proposal selected, or rates not ready (`ratesReady`).

## Interactions

- Hook `useScenarioBreakout` loads proposal list, validates rate card prerequisites, builds `scenarioGroups`, `scopedLines`, `migrationBreakdownRows`, and exposes `exportXLSX`.

## API dependencies

Reads proposals, scenarios, scenario_lines, scoped_services, migration tables, rate_cards — aggregated client-side via hook.

## Page relationships

- **From:** Reports hub.
- **To:** None (read-only report surface).

## Business rules

- Aligns display names with `getScenarioDisplayName`.
