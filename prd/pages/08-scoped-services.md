# Scoped Services

> **Route:** `/proposals/[id]/scoped-services`  
> **Module:** Proposals  
> **Generated:** 2026-04-30

## Overview

Manage **non-scenario** service lines (contingency-style add-ons): each line has a fixed **service type** enum, description, hours, and a **rate card lookup key**. Costs recalculate from hours × loaded rate. Proposal-level **scoped complexity factor** adjusts rolled-up hours and dollars for summary views.

## Layout

- Table of lines with inline editing / add row flow.
- **ScopedComplexityFactor** control for proposal-level multiplier.
- **ContingencySummaryTable** region showing role pricing breakouts (Sr. IM, PM, BA) derived from contingency pricing engine.

## Fields — Line

| Field | Type | Rules |
|-------|------|-------|
| Service type | Select enum | One of five scoped service types |
| Description | Text | Max 5000 chars |
| Hours | Number | Finite, ≥ 0 |
| Rate card lookup | Select / text | Required non-empty key, max 255 chars |

Server actions: `addScopedServiceLine`, `updateScopedServiceLine`, `deleteScopedServiceLine`.

## Interactions

### Load

- Fetch scoped lines, active rate cards, proposal complexity factor.

### Add line

- Creates row with defaults via server action; optimistic UI with loading flags (`isAdding`, `savingLineId`, `deletingLineId`).

### Edit line

- Changing hours or rate key recomputes `cost = hours × rate` client-side using rate map.

### Delete line

- Confirmation pattern per button wiring.

### Complexity factor

- Updates proposal row field affecting downstream Summary calculations.

## API dependencies

| Table | Usage |
|-------|-------|
| `scoped_services` | CRUD lines |
| `rate_cards` | Pricing map |
| `proposals` | Scoped complexity factor |

## Page relationships

- **Inbound:** Proposal tab, Summary link.
- **Coupling:** Summary **Scoped Services** row totals.

## Business rules

- Enum list is closed-set — new business types require code + migration update.
