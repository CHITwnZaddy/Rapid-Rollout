# Appendix: Enum & Constants Dictionary

> Cross-reference for values that drive UI labels, validation, and reporting.

## Proposal status

| Value | Typical meaning | Badge styling (UI) |
|-------|-----------------|-------------------|
| Draft | Work in progress | Secondary |
| Proposal Sent | Delivered to customer | Default |
| Customer Review | Customer evaluating | Default |
| Won | Closed favorable | Default |
| Lost | Closed unfavorable | Destructive |
| VOID | Cancelled / invalid | Destructive |

Source: `src/lib/constants/statuses.ts`

## Scenario types (canonical codes → display names)

| Code | Display name |
|------|----------------|
| P1 | Phase 1 |
| P2 | Phase 2 |
| Opt1 | Option 1 |
| Opt2 | Option 2 |

Fixed order for sorting/display: `P1`, `P2`, `Opt1`, `Opt2`.

Source: `src/lib/scenarios/display.ts`

## Scoped service types

| Code |
|------|
| 01 Data Fix |
| 02 Mail Merge |
| 03 Remote Pro Svcs - Design Session(s) |
| 04 Remote Pro Svcs - Requirements Creation |
| 05 Other |

Source: `src/lib/validation/scoped-services.ts`

## Rate-card lookup keys (pricing-critical)

The codebase references special lookup keys for burden and travel pricing (examples include internal cost, Sr. IM, PM, Travel rates). Administrators configure these in **Rate Cards**. Exact key strings live in `src/lib/rate-card-keys.ts` — **do not rename** without updating migrations and engine assumptions.

## Report thresholds

| Report | Constant | Behavior |
|--------|----------|----------|
| Stale proposals | 21 days | Row flagged when days in current status exceeds threshold |
| Time to close | 30 days | Row flagged red when days from sent → closed exceeds threshold |

## User roles (admin UI)

| Role | Stored as |
|------|-----------|
| Standard user | `null` or non-admin in list representation |
| Administrator | `admin` in `app_metadata.role` |

## Theme / font storage keys

Stored in **browser `localStorage`** (not database):

- Theme colors JSON — key defined as `THEME_STORAGE_KEY` in `src/lib/theme.ts`
- Font choice — key defined as `FONT_STORAGE_KEY` in `src/lib/theme.ts`

---

See also [API inventory](./api-inventory.md) for database RPC names.
