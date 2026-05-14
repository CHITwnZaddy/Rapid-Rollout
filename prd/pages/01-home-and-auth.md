# Home, Login, and Sign Up

> **Routes:** `/`, `/login`, `/signup`  
> **Module:** Authentication  
> **Generated:** 2026-04-30

## Overview

The **home route** only routes users based on session: signed-in users go to the dashboard; others go to login. **Login** and **Sign up** are card-based forms backed by Supabase Auth; successful auth redirects to the dashboard.

## Layout

- Auth layout wraps login/signup (centered card pattern per app styling).
- Root `/` has no persistent chrome — immediate redirect.

## Fields — Login

| Field | Type | Required | Validation | Notes |
|-------|------|----------|------------|-------|
| Email | Email input | Yes | HTML `type="email"` | Placeholder: you@example.com |
| Password | Password input | Yes | — | — |

## Fields — Sign up

| Field | Type | Required | Validation | Notes |
|-------|------|----------|------------|-------|
| Full Name | Text | Yes | — | Stored in auth metadata `full_name` |
| Email | Email | Yes | — | — |
| Password | Password | Yes | Min length **6** | Placeholder references minimum length |

## Interactions

### Page load

- `/`: Server reads Supabase session; redirects to `/dashboard` or `/login`.
- Middleware runs on other routes to sync cookies and enforce redirects.

### Login submit

- **Trigger:** User submits form.
- **Behavior:** `signInWithPassword`; on error show message in destructive banner; on success `router.push("/dashboard")` and `router.refresh()`.

### Sign up submit

- **Trigger:** User submits form.
- **Behavior:** `signUp` with metadata; same success navigation as login.

### Cross-links

- Login footer links to `/signup`; signup footer links to `/login`.

## API dependencies

| Operation | Trigger | Notes |
|-----------|---------|-------|
| `auth.signInWithPassword` | Login submit | Client Supabase |
| `auth.signUp` | Signup submit | Includes `full_name` in user metadata |
| `auth.getUser` (server) | Home page | Session probe |

## Page relationships

- **From:** Marketing/bookmarks (direct URLs).
- **To:** `/dashboard` after success; middleware blocks returning to auth pages when session exists.

## Business rules

- Password reset / email confirmation UX is **[TBC]** — depends on Supabase project configuration not visible in these routes alone.
