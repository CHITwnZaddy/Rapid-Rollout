# Admin: Service Hours

> **Route:** `/admin/service-hours`  
> **Module:** Admin  
> **Generated:** 2026-04-30

## Overview

Maintains **`service_hours`** catalog rows that drive scenario grid line generation — hours by scope for Sr. IM, PM, and BA roles.

## Table columns

| Column | Label |
|--------|-------|
| service_name | Service Name |
| scope_value | Scope Value |
| scope_label | Scope Label |
| sr_im_hours | Sr. IM Hrs |
| pm_hours | PM Hrs |
| ba_hours | BA Hrs |
| service_group | Group |
| status | Status |
| lookup_key | Lookup Key |

## Create defaults

| Field | Default |
|-------|---------|
| service_name | New Service |
| scope_value | Included |
| scope_label | Included |
| sr_im_hours / pm_hours / ba_hours | 0 |
| service_group | Core |
| status | Active |
| lookup_key | `NewService|Included__AUTO__` |

## Auth & cache

- Admin-only mutations.
- Revalidate `/admin/service-hours`.

## Page relationships

- **Consumers:** Scenario grid (`service_hours` Active), pricing engines.

## Business rules

- Inactive rows do not load into scenario editors.
