// Barrel for the proposal server actions. The implementations live in
// per-concern modules (see below); this file only re-exports them so the
// stable "@/app/(app)/proposals/[id]/actions" import path keeps working for
// every component and test. Each concern module carries its own "use server"
// directive — this barrel intentionally has none and is a pure passthrough.
//
//  - lifecycle-actions:     status transitions + won/lost closeout + corrections
//  - complexity-actions:    scenario / scoped complexity factor updates
//  - scenario-grid-actions: scenario grid scope-selection persistence
//  - crud-actions:          rename + delete
export * from "./lifecycle-actions";
export * from "./complexity-actions";
export * from "./scenario-grid-actions";
export * from "./crud-actions";
