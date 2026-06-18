# New Proposal

> **Route:** `/proposals/new`  
> **Module:** Proposals  
> **Generated:** 2026-04-30

## Overview

Creates a **new proposal bundle** (proposal plus related records via database routine) from a short form: name and optional customer.

## Layout

- Centered card with title **New Proposal**, description mentioning six scenarios.
- Form: name field, customer select, footer actions **Cancel** and **Create Proposal**.

## Fields

| Field | Type | Required | Validation | Notes |
|-------|------|----------|------------|-------|
| Proposal Name | Text input | Yes | Trimmed, 1–200 chars | Client + server schema |
| Customer | Select | No | Empty or valid UUID | Loads all customers by `company_name` order |

## Interactions

### Customer load

- On mount: fetch `customers` id + company_name.
- On failure: inline error + **Retry** button; toast error.

### Submit

- **Trigger:** Form submit.
- **Validation:** `newProposalSchema` — rejects whitespace-only names and invalid customer ids.
- **Success:** Server action `createProposal` → RPC `create_proposal_bundle`; navigate to `/proposals/{id}`.
- **Failure:** Inline error + toast.

### Cancel

- **Trigger:** Cancel button.
- **Behavior:** `router.back()`.

### Button states

- Submit disabled while loading or while name is empty (after trim logic still relies on required attribute + disabled `!name`).

## API dependencies

| API | Method | Trigger |
|-----|--------|---------|
| List customers | SELECT `customers` | Mount |
| `createProposal` server action | RPC `create_proposal_bundle` | Submit |

## Page relationships

- **From:** Dashboard or proposals list **New Proposal**.
- **To:** New proposal detail `/proposals/[id]`.

## Business rules

- Customer may be omitted intentionally for workflows where the customer record does not exist yet (comment in validation schema).
