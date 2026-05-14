# Phase 1 dashboard and sales ops design spec

Status: Draft for review
Owner: Austin Alexander Guzman
Repo: Rapid Rollout
Date: 2026-05-01

## Decision record

| Area | Decision |
| --- | --- |
| Primary users | Solution Engineers and SE Managers |
| First screen | Dashboard |
| SE default scope | My proposals |
| Manager default scope | Team proposals |
| SE team visibility | SEs can view all proposals |
| Manager access model | Add `manager` role below `admin` |
| Admin nav label | Rename Admin section to Settings |
| Settings structure | One flat Settings group |
| KPI targets | Required for Phase 1 |
| KPI planning horizon | Current calendar year plus 3 future years |
| Quota math | Closed Won only, based on LoE signed date |
| Pipeline probability | Excluded |
| Awaiting Sig | Tracked as open pipeline, excluded from quota |
| Stale clock | Days in current status |
| Stale reset | Status change only |
| On Hold | Kept as a separate accountability bucket |
| Void status | Removed |
| Closeout variance | Stored and visible to team |
| Under variance | Requires reason and internal note |
| Over variance | Stored, no reason or note required |
| Reports | Dashboard widgets route to existing reports with preset filters |

## Executive summary

Phase 1 turns Rapid Rollout from a proposal calculator with reports into an SE workbench.

The first screen should answer 4 questions fast:

1. How much open proposal value do I have?
2. Where is that value sitting by stage?
3. What needs follow-up?
4. How much work sits in each stage?

For SEs, the answer starts with their own book of work. For Managers, the answer starts with the team. Both groups need the ability to move between individual and team views because the SE team shares goals, reuse knowledge, and bonus pressure.

The app must also stop treating manager-owned operating rules as hardcoded product behavior. KPI targets, stale thresholds, and variance reasons belong in Settings, controlled by Managers and Admins.

## Current repo baseline

This spec is grounded in the current app shape:

| Surface | Current state |
| --- | --- |
| Dashboard | `src/app/(app)/dashboard/page.tsx` has count cards and recent proposals |
| Reports landing | `src/app/(app)/reports/page.tsx` links to Proposal Log, Stale Proposals, Portfolio Value, Time to Close, and related reports |
| Proposal Log | `src/app/(app)/reports/proposal-log/page.tsx` supports customer/status filters and XLSX export |
| Stale report | Existing report text says stale proposals are based on days in current status |
| Sidebar | `src/components/layout/app-sidebar.tsx` has a fixed 64-width sidebar and an Admin section |
| Admin gate | `src/app/(app)/admin/layout.tsx` allows only `user.app_metadata.role === "admin"` |
| Server action admin helper | `src/lib/auth/require-admin.ts` has `assertAdmin()` only |
| Status history | `proposal_status_history` exists and records status transitions |
| Proposal owner | Proposals have `created_by`, currently used for ownership-style filtering |

## Goals

1. Replace the generic dashboard with a focused SE and Manager dashboard.
2. Add manager-controlled Settings for KPI targets, stale thresholds, and variance reasons.
3. Add the `manager` role without turning Managers into full Admins.
4. Make proposal status definitions match how SEs actually work.
5. Make closeout strict enough to protect quota and handoff data.
6. Preserve team visibility while keeping SEs centered on their own work.
7. Route dashboard widgets into existing report screens with preset filters.
8. Improve responsive behavior, including a hideable left nav.
9. Use softer status colors, but never rely on color alone.

## Non-goals

| Non-goal | Reason |
| --- | --- |
| Recreate Salesforce | This is an internal scoping and operations tool |
| Add probability-weighted pipeline | Austin rejects probability pipeline as fake money for quota planning |
| Build a full custom report engine | Proposal Log already covers the Phase 1 export/report surface |
| Build proposal emailing | Useful later, too large for Phase 1 |
| Build productized offering management | Important later, separate workflow |
| Add HR rationale to KPI targets | Rationale belongs in HR systems |
| Let SEs edit closed financials | Manager/Admin correction only |
| Let follow-up dates reset stale status | SEs could use that to hide stale work |

## Users and roles

### Role model

| Role | Meaning | Default landing | Proposal visibility | Settings access |
| --- | --- | --- | --- | --- |
| SE / user | Standard Solution Engineer | My dashboard | My proposals first, can view team | None |
| Manager | SE Manager | Team dashboard | All SE proposals, can filter by SE | Ops settings and Change Log |
| Admin | System super user | Team or admin-preferred dashboard | All proposals | All Settings |

### Manager role

The app needs a lower-level admin role named `manager`.

Managers can:

- View team dashboard.
- Filter team dashboard by individual SE.
- View all SE proposals.
- Edit KPI targets.
- Edit stale thresholds.
- Edit variance reasons.
- View Change Log.

Managers cannot:

- Manage users or roles.
- Edit rate cards.
- Edit service hours.
- Delete users.
- Delete core operating data.

### Admin role

Admins can do everything Managers can do, plus existing system administration:

- Customers
- Rate Cards
- Service Hours
- Users
- Change Log
- KPI Targets
- Stale Thresholds
- Variance Reasons

## Authentication and RLS model

Auth guards and RLS solve different problems.

| Layer | What it protects | Required change |
| --- | --- | --- |
| Page guard | Which screens a signed-in user can open | Add manager-aware Settings routing |
| Server action guard | Which mutations a signed-in user can run | Add `assertManagerOrAdmin()` |
| RLS | Which database rows a user can read or write | Add policies for new settings tables and manager access |

The app currently checks `user.app_metadata.role === "admin"`. Phase 1 should extend that model to support:

- `user`
- `manager`
- `admin`

Recommended helper names:

| Helper | Allows |
| --- | --- |
| `assertAuthenticated()` | Any signed-in user |
| `assertManagerOrAdmin()` | Manager or Admin |
| `assertAdmin()` | Admin only |

RLS must match the app guard. A Manager should not be able to see a Settings link and then fail at the database layer. A standard SE should not be able to call a server action directly and bypass the hidden UI.

## Navigation model

Rename the left nav group from Admin to Settings.

Use one flat expandable Settings group. Do not create nested groups such as Settings > Admin > SE Ops.

### Settings visibility

| Nav item | SE/user | Manager | Admin |
| --- | --- | --- | --- |
| Customers | No | No | Yes |
| Rate Cards | No | No | Yes |
| Service Hours | No | No | Yes |
| Users | No | No | Yes |
| Change Log | No | Yes | Yes |
| KPI Targets | No | Yes | Yes |
| Stale Thresholds | No | Yes | Yes |
| Variance Reasons | No | Yes | Yes |
| Theme | No | No | Yes |

### Responsive nav

The current layout uses a fixed sidebar. Phase 1 needs:

- Desktop: sidebar visible by default.
- Tablet: sidebar collapsible.
- Phone: sidebar hidden behind a menu button.
- Expanded browser view: content should resize without clipping tables, cards, or filters.

Minimum acceptance:

- The dashboard works at desktop, iPad-width, and iPhone-width.
- The left nav can be hidden without losing access to navigation.
- Tables scroll horizontally only when columns truly need it.
- Buttons and status labels do not wrap into broken layouts.

## Dashboard model

### Default scope

| User | Default dashboard scope | Available scope switch |
| --- | --- | --- |
| SE/user | My proposals | My, Team |
| Manager | Team proposals | Team, Individual SE |
| Admin | Team proposals | Team, Individual SE |

SEs can view team proposals because clients do not overlap and reuse knowledge matters.

Managers start with team data because their job is team oversight. They can filter to individual SEs for 1:1s and coaching.

### Dashboard layout

Desktop layout should use a 2 by 2 grid.

| Position | Widget | Primary question |
| --- | --- | --- |
| Upper left | Open Proposal Value | How much proposal value is currently active? |
| Upper right | Value by Stage | Where is the money sitting? |
| Bottom left | Needs Follow-Up | What is stale or on hold? |
| Bottom right | Count by Stage | Where is the work sitting? |

Tablet can use 2 columns when space allows. Phone should stack the widgets in the same order.

### Widget definitions

#### Open Proposal Value

Shows total active open proposal value for the selected scope and date range.

Included statuses:

- Discovery
- Scoping
- Proposal Draft
- Sent for Review
- Negotiations
- Awaiting Sig
- On Hold

Excluded statuses:

- Closed Won
- Closed Lost

Awaiting Sig is open pipeline. It does not count toward quota until the LoE signed date exists.

#### Value by Stage

Shows dollars by stage for the selected scope and date range.

This answers where the money sits.

Recommended visual:

- Horizontal bar chart for readability.
- Use exact values in labels or tooltips.
- Use the same status ordering everywhere in the app.

#### Needs Follow-Up

Shows stale and On Hold separately.

Example:

| Bucket | Count | Meaning |
| --- | ---: | --- |
| Stale | 6 | Active proposals past the threshold for current status |
| On Hold | 3 | Proposals intentionally paused |

On Hold stays visible because it creates accountability. It should not be mixed into stale aging.

#### Count by Stage

Shows number of proposals by stage.

This answers where the work sits. It should not be replaced by Value by Stage because 1 large proposal can hide 12 small proposals in the same stage.

Recommended visual:

- Simple bar chart or compact stage list.
- Sort by lifecycle order, not dollar value.

### Date filters

Phase 1 dashboard filters:

| Filter | Meaning |
| --- | --- |
| Current Year | Calendar year to date |
| Current Quarter | Calendar quarter to date |
| Custom Range | User-selected start and end dates |

Default filter: Current Year.

No Current Month quick filter in Phase 1. A user can get month-level data through Custom Range.

### Quota and bonus logic

Quota progress uses Closed Won only.

The close date is the LoE signed date, not the status change date.

Example:

| LoE signed date | Calendar result |
| --- | --- |
| March 31 | Q1 |
| April 1 | Q2 |

If a Sr. AE gets the signed LoE on March 31, that deal counts in Q1, even when March 31 falls on a Sunday.

Awaiting Sig should be visible because it is close to done. It should not inflate quota progress.

## Dashboard click-through

Dashboard widgets should route to existing reports with preset filters. The user should not have to click Reports, pick a report, and rebuild the same filter by hand.

| Widget click | Destination | Preset filters |
| --- | --- | --- |
| Open Proposal Value | Proposal Log | Active statuses, selected scope, selected date range |
| Value by Stage bar | Proposal Log | Clicked status, selected scope, selected date range |
| Needs Follow-Up: Stale | Stale Proposals | Stale only, selected scope |
| Needs Follow-Up: On Hold | Proposal Log | Status = On Hold, selected scope |
| Count by Stage bar | Proposal Log | Clicked status, selected scope, selected date range |

The destination report must show the applied filters and let the user change them.

Implementation note: use query parameters for report presets. Final names can be chosen during implementation, but the intent should be stable:

```text
/reports/proposal-log?status=awaiting-sig&owner=me&range=current-year
/reports/stale-proposals?bucket=stale&owner=team
```

## Proposal lifecycle

### Final status list

| Order | Status | Keep? |
| ---: | --- | --- |
| 1 | Discovery | Yes |
| 2 | Scoping | Yes |
| 3 | Proposal Draft | Yes |
| 4 | Sent for Review | Yes |
| 5 | Negotiations | Yes |
| 6 | Awaiting Sig | Yes |
| 7 | Closed Won | Yes |
| 8 | Closed Lost | Yes |
| 9 | On Hold | Yes |
| 10 | Void | No |

Void should be removed. If a proposal is dead, it is Closed Lost. If it was created by mistake, it is Closed Lost with reason `Created in error`.

### Status definitions

| Status | Definition |
| --- | --- |
| Discovery | SE and AE are working with the client to understand the ask, need, or want |
| Scoping | AE has dropped out of the cycle; SE is writing requirements, asking questions, researching, and running numbers |
| Proposal Draft | AE reviews final numbers with the SE; changes happen here before customer review |
| Sent for Review | AE sends proposal to customer; if accepted, it can bypass Negotiations and move to Awaiting Sig |
| Negotiations | AE and customer are working numbers, usually because the customer wants a discount |
| Awaiting Sig | Proposal is in the customer's purchasing process |
| Closed Won | Signed LoE received |
| Closed Lost | Customer nixed the deal, or the proposal was created in error |
| On Hold | Edge-case pause that still needs visibility |

### Dashboard buckets

Dashboard stage buckets should map cleanly to the lifecycle.

| Dashboard bucket | Included statuses |
| --- | --- |
| Discovery / Scoping | Discovery, Scoping |
| Draft | Proposal Draft |
| Client Review | Sent for Review |
| Negotiation | Negotiations |
| Awaiting Sig | Awaiting Sig |
| Closed Won | Closed Won |
| Closed Lost | Closed Lost |
| On Hold | On Hold |

## Stale and On Hold logic

### Dates

| Field | Meaning | Editable by SE? |
| --- | --- | --- |
| Created Date | Date the proposal was first saved | No |
| Current Status Entered Date | Date the proposal entered its current status | No |
| Proposal Age | Days since Created Date | No, calculated |
| Days in Current Status | Days since Current Status Entered Date | No, calculated |

Created Date must be visible on the proposal detail page.

### Stale rule

Stale is based on how long the proposal has been in its current status.

Only a status change resets the stale clock.

Follow-up date can be added later, but it must not reset stale. That field would be a reminder, not a control.

### Default stale thresholds

These values must be editable by Manager/Admin in Settings.

| Status | Default stale threshold |
| --- | ---: |
| Discovery | 21 days |
| Scoping | 21 days |
| Proposal Draft | 5 days |
| Sent for Review | 3 days |
| Negotiations | 3 days |
| Awaiting Sig | 14 days |

On Hold has no stale threshold. It is a separate accountability bucket.

## KPI targets

KPI targets are required for Phase 1. Without them, the dashboard can show activity but cannot show whether the team is on pace.

### Planning horizon

Use calendar years for Phase 1.

| Fiscal year | Label | Team quota |
| ---: | --- | ---: |
| 2026 | FY26 | $8,000,000 |
| 2027 | FY27 | $9,000,000 |
| 2028 | FY28 | $10,000,000 |
| 2029 | FY29 | $11,000,000 |

The label can use `FY26`, but the math should use the calendar year.

### Target structure

| Field | Meaning |
| --- | --- |
| Year | Calendar year |
| Label | Display label, such as FY26 |
| Team quota | Annual team closed-won goal |
| SE target | Annual individual closed-won goal |
| SE owner | User tied to the target |
| Active | Whether the target is used |

Examples:

| SE | FY26 target |
| --- | ---: |
| Austin | $3,500,000 |
| Aaron | $2,500,000 |
| Sovathya | $2,200,000 |

Do not add seniority or role-level quota in Phase 1. The target number already tells Lucas what level the SE is operating at.

### Team and personal bonus view

Quota logic must support both:

- Personal progress against individual SE target.
- Team progress against team quota.

Example:

| SE | Individual target | Closed Won | Personal result | Team result |
| --- | ---: | ---: | --- | --- |
| Austin | $3,500,000 | $5,000,000 | Over target | Counts toward $8,000,000 team quota |
| Aaron | $2,000,000 | $1,000,000 | Under target | Still contributes to team quota |

If the team hits $8,000,000, the team bonus condition is met even if one SE misses their individual KPI.

## Closeout model

### Closed Won trigger

Moving a proposal to Closed Won requires LoE signed date.

The LoE signed date triggers Professional Services handoff and quota recognition.

### Closeout fields

| Field | Required when | Who can enter at close |
| --- | --- | --- |
| `sold_price` | Closed Won | System captures from proposal total |
| `loe_value` | Closed Won | SE confirms or updates from signed LoE |
| `loe_signed_date` | Closed Won | SE |
| `variance_amount` | Closed Won | System calculates |
| `variance_reason` | LoE value is lower than sold price | SE |
| `variance_note` | LoE value is lower than sold price | SE |

Formula:

```text
variance_amount = loe_value - sold_price
```

### Variance rules

| Result | Required |
| --- | --- |
| LoE value equals sold price | LoE signed date |
| LoE value is greater than sold price | LoE signed date |
| LoE value is lower than sold price | LoE signed date, variance reason, internal note |

Positive variance is good news. It should be stored and visible, but it does not need a note.

Under variance requires explanation because leadership will ask why the signed LoE came in lower than the sold price.

### Variance reasons

Manager/Admin manage this list in Settings. SEs select from it during closeout.

No `Other` reason.

| Reason | Description |
| --- | --- |
| AE discount | Sr. AE discounted before signature |
| Scope removed | Client removed optional work |
| Pricing correction | Error caught before LoE |
| Client negotiation | Final commercial negotiation changed price |

### Internal note

Under variance requires an internal note.

Validation:

- Trim whitespace.
- Require at least 10 characters.
- Store note internally.
- Do not show the note on the dashboard.

The app can enforce the rule. It cannot force a thoughtful note. If an SE enters a period or nonsense, that is a management issue, not a software issue.

### Closed financial correction

After a proposal is Closed Won:

| Actor | Can edit closed financial fields? |
| --- | --- |
| SE/user | No |
| Manager | Yes |
| Admin | Yes |

Manager/Admin can correct:

- `sold_price`
- `loe_value`
- `loe_signed_date`
- `variance_reason`
- `variance_note`

Every correction must write to Change Log.

Minimum audit detail:

| Audit field | Required |
| --- | --- |
| Proposal | Yes |
| Field changed | Yes |
| Old value | Yes |
| New value | Yes |
| Changed by | Yes |
| Changed at | Yes |
| Correction note | Yes |

## Closed Lost model

Closed Lost requires a reason and note.

No separate lost date is needed. Use the status change timestamp from `proposal_status_history`.

Reasons:

| Reason | Meaning |
| --- | --- |
| Price | Customer rejected the commercial terms |
| Scope changed | Customer need changed enough that this proposal no longer fits |
| No decision | Customer did not move forward |
| Timing | Customer paused or deferred the work |
| Competitor | Customer chose another vendor or path |
| Created in error | Duplicate, wrong customer, wrong AE, test record, or fat-fingered proposal |

Do not keep Duplicate as its own reason. Duplicate is a kind of created-in-error record. Keeping both makes the dropdown noisier without giving better management signal.

## Proposal ownership

The proposal owner is the SE.

Ownership rule:

- The SE who does the heavy lift owns the proposal.
- Other SEs can view it to learn from it or reuse the thinking.
- Reuse by another SE does not transfer ownership of the original proposal.

Example:

Austin scopes an Auto Filer for Google. Austin owns that proposal.

Aaron later sells the productized Auto Filer to another client. Aaron owns that later proposal. He can use Austin's requirements as reference, but he does not own Austin's original Google proposal.

## Reporting and export

Phase 1 should use Proposal Log as the report/export surface.

Current Proposal Log already has:

- Customer filter.
- Status filter.
- Grand total.
- Date columns.
- XLSX export.

Phase 1 report work should add only what dashboard routing needs:

| Need | Report impact |
| --- | --- |
| Scope filter | Add owner/team/SE filter where missing |
| Date filter | Add date range support where missing |
| Stage click-through | Accept status query parameter |
| Stale click-through | Accept stale bucket query parameter in Stale Proposals |
| On Hold click-through | Accept status query parameter in Proposal Log |

Do not build a separate CSV export only for the dashboard. XLSX from Proposal Log is enough for Phase 1.

## Visual design rules

The current UI reads generic. Phase 1 should make it feel like a quiet internal command center for SEs.

### Direction

| Design choice | Requirement |
| --- | --- |
| Density | Workbench density, no marketing hero layout |
| Cards | Use for dashboard widgets and repeated records |
| Charts | Simple bar/donut visuals where they answer a real question |
| Tables | Dense, sortable, filterable |
| Tone | Calm, operational, serious |
| Mobile | Functional first, no decorative collapse |

### Color system

Avoid hard green, red, and yellow traffic-light colors.

Use softer semantic colors:

| Meaning | Color direction |
| --- | --- |
| Good / Closed Won | Soft sage or muted emerald |
| Warning / stale | Warm amber or muted gold |
| Problem / under variance | Soft rose or muted red |
| On Hold | Cool slate or muted blue-gray |
| Neutral / draft | Soft neutral with strong text contrast |

Color is only one signal. The app should use a combination of signals: label, icon, position, and filter behavior.

Example:

| Status | Color | Label | Position | Behavior |
| --- | --- | --- | --- | --- |
| Stale | Amber | "Stale" | Needs Follow-Up widget | Click opens stale report |
| On Hold | Slate | "On Hold" | Needs Follow-Up widget | Click opens Proposal Log filtered to On Hold |
| Under variance | Rose | "Under LoE" | Proposal detail/report | Requires reason and note |
| Closed Won | Sage | "Closed Won" | Closed bucket | Counts toward quota by LoE signed date |

## Data model changes

This section names conceptual tables and fields. Final migration names can change during implementation.

### Roles

Current role source: `auth.users.raw_app_meta_data.role`, exposed as `user.app_metadata.role`.

Add accepted value:

```text
manager
```

### KPI targets

Suggested tables:

```text
kpi_year_targets
kpi_user_targets
```

Suggested fields:

| Table | Field | Notes |
| --- | --- | --- |
| `kpi_year_targets` | `year` | Calendar year, unique |
| `kpi_year_targets` | `label` | FY26, FY27, etc. |
| `kpi_year_targets` | `team_quota` | Numeric money value |
| `kpi_year_targets` | `is_active` | Keeps old years available |
| `kpi_user_targets` | `year` | Calendar year |
| `kpi_user_targets` | `user_id` | SE user |
| `kpi_user_targets` | `target_amount` | Numeric money value |
| `kpi_user_targets` | `is_active` | Lets Manager turn a target off |

### Stale thresholds

Suggested table:

```text
proposal_stale_thresholds
```

Fields:

| Field | Notes |
| --- | --- |
| `status` | Unique |
| `threshold_days` | Positive integer |
| `is_active` | Soft disable |
| `updated_by` | User id |
| `updated_at` | Timestamp |

### Variance reasons

Suggested table:

```text
proposal_variance_reasons
```

Fields:

| Field | Notes |
| --- | --- |
| `code` | Stable key |
| `label` | User-facing label |
| `description` | Manager-controlled description |
| `sort_order` | Dropdown order |
| `is_active` | Soft disable |

Seed records:

| Code | Label |
| --- | --- |
| `ae_discount` | AE discount |
| `scope_removed` | Scope removed |
| `pricing_correction` | Pricing correction |
| `client_negotiation` | Client negotiation |

### Proposal closeout fields

Add to proposals or a one-to-one closeout table.

Suggested fields:

| Field | Type idea | Notes |
| --- | --- | --- |
| `sold_price` | numeric | Captured from proposal total at close |
| `loe_value` | numeric | Signed LoE value |
| `loe_signed_date` | date | Drives quota period |
| `variance_reason_code` | text or FK | Required only when under sold price |
| `variance_note` | text | Required only when under sold price |
| `closed_financials_corrected_at` | timestamptz | Optional convenience field |
| `closed_financials_corrected_by` | uuid | Optional convenience field |

### Closed Lost fields

Suggested fields:

| Field | Type idea | Notes |
| --- | --- | --- |
| `closed_lost_reason` | text | Required when status moves to Closed Lost |
| `closed_lost_note` | text | Required when status moves to Closed Lost |

Lost date comes from status history.

## RLS requirements

RLS should be explicit for each new table.

| Table | SE/user | Manager | Admin |
| --- | --- | --- | --- |
| KPI year targets | Read | Read/write | Read/write |
| KPI user targets | Read own and team summary if dashboard needs it | Read/write | Read/write |
| Stale thresholds | Read | Read/write | Read/write |
| Variance reasons | Read active | Read/write | Read/write |
| Closed financial fields | Read allowed proposal rows | Correct after close | Correct after close |
| Change Log | No | Read | Read |

Open implementation question: whether SEs should see every individual KPI target or only team summary plus their own. The dashboard needs team quota and personal quota. It may not need to show every SE target to every SE.

## Metric definitions

| Metric | Formula |
| --- | --- |
| Open proposal value | Sum of current proposal totals for active statuses |
| Value by stage | Sum of current proposal totals grouped by status bucket |
| Count by stage | Count of proposals grouped by status bucket |
| Stale count | Count of active proposals where days in status > threshold for current status |
| On Hold count | Count of proposals where status = On Hold |
| Closed Won revenue | Sum of LoE value or sold price, based on final implementation decision below |
| Quota progress | Closed Won revenue in selected calendar period divided by target |
| Variance | LoE value minus sold price |

### Revenue source for quota progress

Austin's stated rule: original sold price counts toward bonus even when LoE value changes.

Therefore Phase 1 should use:

```text
quota_revenue = sold_price
```

Use `loe_value` for operational truth and variance reporting.

This is weird, but the system should reflect the bonus rule instead of "fixing" it.

## Implementation phases

### Phase 1A: schema and role foundation

Risk: higher-risk refactor because this touches migrations, RLS, and auth behavior.

Work:

- Add `manager` role support.
- Add Manager/Admin auth helper.
- Add KPI target tables.
- Add stale threshold table.
- Add variance reason table.
- Add closeout fields.
- Add Closed Lost reason/note fields.
- Add RLS policies.
- Add seed data for KPI years, stale thresholds, and variance reasons.

Validation:

- Migration applies cleanly to staging.
- Standard SE cannot write settings tables.
- Manager can write manager-owned settings tables.
- Manager cannot manage users, rate cards, or service hours.
- Admin can access all Settings pages.

### Phase 1B: Settings pages

Risk: behavior-tightening.

Work:

- Rename Admin nav group to Settings.
- Add role-based Settings visibility.
- Add KPI Targets page.
- Add Stale Thresholds page.
- Add Variance Reasons page.
- Add Manager access to Change Log.

Validation:

- SE sees no Settings group.
- Manager sees Change Log, KPI Targets, Stale Thresholds, Variance Reasons.
- Admin sees all Settings items.
- Save actions enforce server-side role checks.

### Phase 1C: proposal lifecycle and closeout

Risk: behavior-tightening with migration impact.

Work:

- Replace current status list with final lifecycle list.
- Remove Void from active UI choices.
- Require Closed Lost reason and note.
- Require LoE signed date for Closed Won.
- Capture `sold_price` at close.
- Capture `loe_value`.
- Calculate variance.
- Require reason/note for under variance.
- Lock SE edits to closed financial fields.
- Allow Manager/Admin correction with Change Log entry.

Validation:

- SE cannot close won without LoE signed date.
- SE cannot close lost without reason and note.
- Under variance cannot save without reason and note.
- Equal and positive variance do not require reason/note.
- SE cannot edit closed financial fields after close.
- Manager/Admin correction writes audit entry.

### Phase 1D: dashboard and report routing

Risk: behavior-tightening.

Work:

- Replace current dashboard with 4-widget layout.
- Add scope switch.
- Add date filters.
- Add KPI progress.
- Add stale and On Hold split.
- Add report deep links with preset filters.
- Extend Proposal Log and Stale Proposals filters as needed.

Validation:

- SE default dashboard shows My proposals.
- Manager default dashboard shows Team proposals.
- SE can switch to Team view.
- Manager can filter by SE.
- Widget clicks land on report screens with filters applied.
- Awaiting Sig does not count toward quota.
- Closed Won counts by LoE signed date.

### Phase 1E: visual and responsive pass

Risk: safe/no behavior change, except responsive nav behavior.

Work:

- Make sidebar collapsible/hideable.
- Apply softer semantic status colors.
- Tighten dashboard spacing.
- Make charts and tables readable across desktop/tablet/phone.
- Add non-color status cues.

Validation:

- Desktop dashboard has 2 by 2 widget grid.
- Tablet layout remains readable.
- Phone layout stacks without broken controls.
- Left nav can be hidden and reopened.
- Color is paired with text/icon/position cues.

## Test plan

| Area | Test type | What to prove |
| --- | --- | --- |
| Role helpers | Vitest | `manager` passes Manager/Admin checks but fails Admin-only checks |
| Server actions | Vitest | Settings mutations reject SE users |
| RLS | Staging DB verification | Policies match app roles |
| KPI targets | Vitest plus browser check | Manager can edit targets and dashboard reads them |
| Stale thresholds | Vitest | Stale calculation uses editable threshold and current status date |
| Closeout | Vitest | Closed Won validations match variance rules |
| Closed Lost | Vitest | Reason and note are required |
| Change Log | Vitest or DB test | Manager/Admin corrections create audit row |
| Dashboard filters | Browser check | Scope and date filters change widget data |
| Report routing | Browser check | Widget links apply visible report filters |
| Responsive layout | Browser screenshots | Desktop, iPad, and iPhone widths do not clip important UI |

## Acceptance criteria

### Role and Settings

- Manager role exists.
- Manager sees Settings with only Change Log, KPI Targets, Stale Thresholds, and Variance Reasons.
- Admin sees all Settings items.
- SE sees no Settings group.
- Manager cannot access Admin-only pages by URL.
- SE cannot mutate manager-owned settings through direct server action calls.

### KPI targets

- Manager/Admin can enter team quotas for FY26 through FY29.
- Manager/Admin can enter SE targets by year.
- Dashboard can calculate personal and team progress from targets.
- Calendar year drives the reporting period.

### Dashboard

- SE lands on My dashboard.
- Manager lands on Team dashboard.
- Dashboard has Open Proposal Value, Value by Stage, Needs Follow-Up, and Count by Stage.
- Needs Follow-Up separates Stale and On Hold.
- Awaiting Sig appears as open pipeline but does not count toward quota.
- Closed Won revenue counts in the period of the LoE signed date.
- Widget clicks route to existing report screens with filters applied.

### Lifecycle

- Final status list is Discovery, Scoping, Proposal Draft, Sent for Review, Negotiations, Awaiting Sig, Closed Won, Closed Lost, On Hold.
- Void is removed from UI choices.
- Created Date is visible and immutable.
- Days in Current Status drives stale.
- Status change is the only stale reset.

### Closeout

- Closed Won requires LoE signed date.
- `sold_price` is captured at close.
- `loe_value` is captured at close.
- Variance is calculated.
- Under variance requires reason and internal note.
- Positive variance requires no note.
- SE cannot edit closed financial fields after close.
- Manager/Admin can correct closed financial fields with audit trail.

### Visual and responsive

- Dashboard feels like an internal workbench.
- Status colors are softer than hard red/yellow/green.
- Color is paired with label, icon, position, or filter behavior.
- Sidebar can hide on smaller screens.
- Dashboard and reports work on desktop, iPad-width, and iPhone-width.

## Open questions before implementation

| Question | Default answer for implementation plan |
| --- | --- |
| Should SEs see every SE target? | No. Show team quota and own target unless user approves broader visibility |
| Should Closed Won quota use `sold_price` or `loe_value`? | Use `sold_price` for bonus math; show `loe_value` for operational truth |
| Should Managers access all proposals through RLS or app-only filters? | RLS should allow Manager team read access |
| Should dashboard date range apply to created date, signed date, or current status date? | Open pipeline uses created/current proposal data; Closed Won quota uses LoE signed date |
| Should productized offerings be included in Phase 1? | No. Keep as future design |

## Future work

Items intentionally left out of Phase 1:

- Add customer creation inline during proposal creation.
- Build a real report builder with tabular/summary modes, column picker, grouping, sorting, filters, and saved reports.
- Send proposals by email from the app.
- Send Monday morning digest emails.
- Add productized offering promotion workflow.
- Add client-specific fit notes for productized offerings.
- Add follow-up date reminders that do not affect stale.
- Add fiscal calendar rules if the business ever moves away from calendar-year reporting.
