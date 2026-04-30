# Admin: Users

> **Route:** `/admin/users`  
> **Module:** Admin  
> **Generated:** 2026-04-30

## Overview

Administrators **invite** users by email with role **user** or **admin**, **change roles**, and **delete** accounts. Backed by server actions invoking Supabase admin APIs.

## Layout

- Title **Users**.
- Invite strip: email input, role select (admin/user), invite action.
- Error banner area.
- Users table: email, role, created date, last sign-in, actions.

## Fields — Invite

| Field | Type | Notes |
|-------|------|-------|
| Email | Email input | Required non-empty trim |
| Role | Select | `admin` or `user` |

## Row actions

| Action | Effect |
|--------|--------|
| Role change | Updates `app_metadata.role` via `updateUserRole` |
| Delete | Removes user via `deleteUser` |

## Interactions

- Uses `useTransition` for pending states.
- Optimistic local list updates after role change / delete.
- Errors surfaced as inline message string.

## API dependencies

Server actions: `inviteUser`, `updateUserRole`, `deleteUser` in `admin/users/actions.ts`.

## Page relationships

- **Consumers:** Admin flag across app (`useAuth` / layout gate).

## Business rules

- Listing uses `listUsers` server function — exact fields depend on Supabase admin listing capabilities.
