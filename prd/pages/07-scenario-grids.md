# Scenario Grids (Phase 1, Phase 2, Option 1, Option 2)

> **Routes:** `/proposals/[id]/scenarios/P1`, `.../P2`, `.../Opt1`, `.../Opt2`  
> **Module:** Proposals  
> **Generated:** 2026-04-30

## Overview

Each route edits **one scenario** for the proposal: a **complexity factor** control and a **ScenarioGrid** fed by active **service hours** and **rate cards**. Users build rows of modules and scope selections; hours and costs compute from catalog rates and internal cost rates.

## Layout

- Heading with scenario display name.
- Bordered card containing **ScenarioComplexityFactor** editor.
- **ScenarioGrid** full-width table with add/remove row behaviors (see component).

## Fields

### Complexity factor

| Constraint | Message |
|------------|---------|
| 0.50–9.99 inclusive | Otherwise server rejects update |

### Grid lines (conceptual)

| Concept | Backing columns |
|---------|-----------------|
| Module | `module` |
| Scope selection | `scope_selection` |
| Role hours / costs | Sr. IM, PM, BA columns |
| Lock state | `is_locked` |

Exact column headers come from `ScenarioGrid` component and engine adapters.

## Interactions

### Page load

- Validate `type` route param against `SCENARIO_ORDER`; unknown → 404.
- Load scenario row by proposal + type; missing → 404.
- Load `scenario_lines` ordered by `row_order`.
- Load active `service_hours` and `rate_cards`.
- Resolve **internal cost rate** from rate cards via `INTERNAL_COST_RATE_KEY` (defaults to 0 in grid if missing — summary pages may still fail closed separately).

### Complexity change

- Client calls server action `updateScenarioComplexityFactor` with validation.

### Grid save

- Persists via server pipeline using `saveScenarioGridSchema` and RPC `save_scenario_grid` with computed totals.

## API dependencies

| Operation | Mechanism |
|-----------|-----------|
| Read scenario + lines | Supabase select |
| Update complexity | Server action |
| Save grid | RPC `save_scenario_grid` |

## Page relationships

- **Inbound:** Summary links, proposal tab bar.
- **Outbound:** Summary/Bid sheet indirectly updated after saves.

## Business rules

- Only **Active** catalog rows (`status = Active`) load into pickers.
- Grid persistence rebuilds canonical lines in server action layer to prevent malformed payloads — details in `persist-scenario-grid` helpers.
