# Admin Landing

> **Route:** `/admin`  
> **Module:** Admin  
> **Generated:** 2026-04-30

## Overview

Card grid linking to admin tools: Rate Cards, Service Hours, Customers, Users, Change Log. (**Theme** appears in sidebar but not this grid — accessible via sidebar.)

## Layout

- Title **Admin**.
- Responsive grid of linked cards (title + description).

## Links

| Title | Route |
|-------|-------|
| Rate Cards | `/admin/rate-cards` |
| Service Hours | `/admin/service-hours` |
| Customers | `/admin/customers` |
| Users | `/admin/users` |
| Change Log | `/admin/change-log` |

## Access control

Server layout redirects non-admin users to `/dashboard`.

## Page relationships

- **Inbound:** Sidebar Admin section, direct URL.
- **Outbound:** Admin tools listed above.

## Notes

- Revalidates every **300** seconds (mostly static links).
