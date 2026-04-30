# Admin: Change Log

> **Route:** `/admin/change-log`  
> **Module:** Admin  
> **Generated:** 2026-04-30

## Overview

Read-only audit viewer over **`change_log`** — latest **100** entries descending by `created_at`.

## Layout

- Title **Change Log**.
- Scrollable table: Date, Table, Action, Proposal / Record, Justification / Details, Deleted By.

## Row interpretation

The UI derives friendly columns from JSON payloads:

| Column | Source |
|--------|--------|
| Proposal name | `old_values.name` when string |
| Proposal status snippet | `old_values.status` when string |
| Justification | `new_values.justification` when string |
| Deleted by email | `new_values.deleted_by_email` when string |

## Interactions

- Pure read — no mutations.

## API dependencies

`change_log` select limited to 100 rows.

## Cache

`revalidate = 10` seconds — near-real-time for admin review.

## Page relationships

- Written by deletion flows and other audited mutations server-side.
