import type {
  HoursScenarioLineRow,
  HoursScenarioRow,
} from "@/lib/reports/data";
import type {
  buildMigrationHoursMap,
  buildScopedHoursMap,
} from "@/lib/reports/proposal-aggregates";
import { getScenarioDisplayName, SCENARIO_ORDER } from "@/lib/scenarios/display";

// ─────────────────────────────────────────────────────────────
// Proposal Hours report rows: one row per (proposal, scenario-or-bucket)
// that carries hours. Pure so it can be unit-tested without a DOM.
// ─────────────────────────────────────────────────────────────

export const SCOPED_SERVICES_BUCKET = "Scoped Services";
export const MIGRATION_SERVICES_BUCKET = "Migration Services";

export type ProposalHoursRow = {
  /** Unique per row (React key): see proposalHoursRowId. */
  id: string;
  /** Link target for the Proposal Name column. */
  proposalId: string;
  proposalName: string;
  customerName: string;
  /** Internal scenario code (P1..Opt3) or a synthetic bucket name. */
  scenario: string;
  /** Display name for `scenario`. */
  scenarioLabel: string;
  srImHours: number;
  pmHours: number;
  baHours: number;
  totalHours: number;
  [key: string]: string | number | null;
};

// Unique because scenarios are UNIQUE(proposal_id, scenario_type) and the
// bucket names cannot collide with the P1..Opt3 codes.
export function proposalHoursRowId(proposalId: string, scenario: string): string {
  return `${proposalId}:${scenario}`;
}

export function buildProposalHoursRows({
  proposals,
  customerNames,
  scenarioRows,
  scenarioLineRows,
  scopedHours,
  migrationHours,
  selectedScenario,
}: {
  proposals: { id: string; name: string; customer_id: string | null }[];
  customerNames: Map<string, string>;
  scenarioRows: HoursScenarioRow[];
  scenarioLineRows: HoursScenarioLineRow[];
  scopedHours: ReturnType<typeof buildScopedHoursMap>;
  migrationHours: ReturnType<typeof buildMigrationHoursMap>;
  /** "All", or a scenario code / bucket name from the Scenario filter. */
  selectedScenario: string;
}): ProposalHoursRow[] {
  const lineSumByScenario = new Map<
    string,
    { sr: number; pm: number; ba: number }
  >();
  for (const l of scenarioLineRows) {
    const agg = lineSumByScenario.get(l.scenario_id) ?? { sr: 0, pm: 0, ba: 0 };
    agg.sr += Number(l.sr_im_hours) || 0;
    agg.pm += Number(l.pm_hours) || 0;
    agg.ba += Number(l.ba_hours) || 0;
    lineSumByScenario.set(l.scenario_id, agg);
  }

  const out: ProposalHoursRow[] = [];
  const customerName = (cid: string | null) =>
    customerNames.get(cid ?? "") ?? "—";
  const pushRow = (
    p: { id: string; name: string; customer_id: string | null },
    scenario: string,
    sr: number,
    pm: number,
    ba: number
  ) => {
    out.push({
      id: proposalHoursRowId(p.id, scenario),
      proposalId: p.id,
      proposalName: p.name,
      customerName: customerName(p.customer_id),
      scenario,
      scenarioLabel: getScenarioDisplayName(scenario),
      srImHours: sr,
      pmHours: pm,
      baHours: ba,
      totalHours: sr + pm + ba,
    });
  };

  const scenariosByProposal = new Map<
    string,
    { id: string; type: string }[]
  >();
  for (const s of scenarioRows) {
    if (!scenariosByProposal.has(s.proposal_id))
      scenariosByProposal.set(s.proposal_id, []);
    scenariosByProposal
      .get(s.proposal_id)!
      .push({ id: s.id, type: s.scenario_type });
  }

  const sortedProposals = [...proposals].sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  for (const p of sortedProposals) {
    const pScenarios = (scenariosByProposal.get(p.id) ?? []).sort(
      (a, b) =>
        SCENARIO_ORDER.indexOf(a.type as (typeof SCENARIO_ORDER)[number]) -
        SCENARIO_ORDER.indexOf(b.type as (typeof SCENARIO_ORDER)[number])
    );
    for (const s of pScenarios) {
      // Same rule as the Scoped/Migration buckets below: a scenario with no
      // hours gets no row (every proposal is bootstrapped with all six).
      const sums = lineSumByScenario.get(s.id);
      if (!sums || !(sums.sr || sums.pm || sums.ba)) continue;
      pushRow(p, s.type, sums.sr, sums.pm, sums.ba);
    }
    const sc = scopedHours.get(p.id);
    if (sc && (sc.sr || sc.pm || sc.ba)) {
      pushRow(p, SCOPED_SERVICES_BUCKET, sc.sr, sc.pm, sc.ba);
    }
    const mig = migrationHours.get(p.id);
    if (mig && (mig.pm || mig.srIm)) {
      pushRow(p, MIGRATION_SERVICES_BUCKET, mig.srIm, mig.pm, 0);
    }
  }

  return selectedScenario === "All"
    ? out
    : out.filter((r) => r.scenario === selectedScenario);
}
