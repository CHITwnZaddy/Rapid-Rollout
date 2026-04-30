# Admin: Customers

> **Route:** `/admin/customers`  
> **Module:** Admin  
> **Generated:** 2026-04-30

## Overview

Same **`customers`** table management as `/customers` but reached from the **Admin** navigation area — uses identical column configuration and `AdminDataTable`.

## Columns & defaults

See [Customers (Directory)](./10-customers.md).

## Revalidation paths

Updates trigger `/customers` and `/admin/customers` per config.

## Access control

Admin route layout required (JWT admin role).

## Page relationships

- Duplicates capability of `/customers` for admins who live under Admin menu.
