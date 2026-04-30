# Migration Services

> **Route:** `/proposals/[id]/migration`  
> **Module:** Proposals  
> **Generated:** 2026-04-30

## Overview

Configure **data migration effort** for a proposal: numeric drivers (projects, import sizing, trips, documentation), boolean flags (effort/workshop inclusion), **complexity factor**, core hour buckets, and three **detail sections** (project / workflow / cost lines). Totals and internal pricing derive from migration engine + rate card.

## Layout

- Loading state message while hook fetches.
- Error cards:
  - **rateError** — missing migration pricing rates; blocks saves.
  - **loadError** — data integrity issue; page does not auto-create missing migration rows (explicit policy).
- Normal state: `MigrationConfigForm`, `MigrationTotalsSummary`, `MigrationDetailSection` regions.

## Fields — Configuration (representative)

Backed by `migration_config` columns:

| Field area | Examples |
|------------|----------|
| Scale | Number of projects, hours per import, lines per import file |
| Options | Effort included?, Workshop included? |
| Complexity | Migration complexity factor |
| Travel | Sr. IM trips, PM trips |
| Documentation | Average MB per project, MB per hour processing |
| Core hours | Requirements, migration plan, validation, final QA, PM oversight |

Exact labels live in `MigrationConfigForm`.

## Fields — Detail lines (`migration_detail_lines`)

| Concept | Columns |
|---------|---------|
| Section | `project` \| `workflow` \| `cost` |
| Label | Human label |
| Quantity | Numeric driver |
| Items per object | Scaling helper |
| Total line items | Scaling helper |
| Row order | Ordering |

## Interactions

### Persistence hook (`useMigrationConfig`)

- Debounced saves for config changes.
- Row add/update/remove per section with pending save retries surfaced in UI (`retryPendingSaves`, `clearSaveError`).

### Rate failure

- Shows monospace error detail and retry button.

### Load failure

- Explains missing migration records are **not** auto-created.

## API dependencies

| Resource | Role |
|----------|------|
| `migration_config` | Single row per proposal |
| `migration_detail_lines` | Many rows grouped by section |
| `rate_cards` | Sr. IM, PM, Travel, internal cost |

## Page relationships

- **Inbound:** Proposal tab, Summary link.
- **Coupling:** Summary recomputes migration totals live from same inputs.

## Business rules

- Migration client price and hours feed bid sheet and summary discount allocation.
- Admin must maintain required rate rows — otherwise migration UI blocks saves.
