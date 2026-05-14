# Customers (Directory)

> **Route:** `/customers`  
> **Module:** Customers  
> **Generated:** 2026-04-30

## Overview

Authenticated users maintain the shared **customer directory** using the reusable admin-style data table (`AdminDataTable`) configured for the `customers` table — inline spreadsheet editing, create row, delete row.

## Layout

- Page title **Customers**.
- Single data table with columns defined in admin config.

## Fields — Table columns

| Column key | Label | Type |
|------------|-------|------|
| company_name | Company Name | text |
| address_line1 | Address 1 | text |
| address_line2 | Address 2 | text |
| city | City | text |
| state | State | text |
| zip | Zip | text |

## Interactions

### Load

- Server fetch `customers` `*` ordered by `company_name`.
- Page uses **60s revalidation**.

### CRUD

- Handled by `AdminDataTable` + server actions in `src/components/admin/actions.ts` with auth mode **authenticated** for customers (not admin-only).

### Create defaults

New row seeds: `company_name: "New Company"`, blank address fields per config.

## API dependencies

| Table | Operations |
|-------|------------|
| `customers` | SELECT list; INSERT/UPDATE/DELETE via table actions |

## Page relationships

- **Inbound:** Sidebar **Customers**.
- **Consumers:** New proposal customer picker; bid sheet customer picker; reports filtering.

## Business rules

- Changes should revalidate `/customers` and `/admin/customers` paths when mutations succeed (per config `revalidatePaths`).
