import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authAssertMock,
  managerAssertMock,
  changeLogInsertMock,
  fromMock,
  proposalsEqByIdMock,
  proposalsUpdateMock,
  rateCardsEqMock,
  rateCardsSelectMock,
  rateCardsReturnsMock,
  revalidatePathMock,
  rpcMock,
  scenarioEqByIdMock,
  scenarioEqByProposalMock,
  scenarioLinesEqMock,
  scenarioLinesOrderMock,
  scenarioLinesReturnsMock,
  scenarioLinesSelectMock,
  scenarioSingleMock,
  scenariosSelectMock,
  serviceHoursEqMock,
  serviceHoursReturnsMock,
  serviceHoursSelectMock,
} = vi.hoisted(() => ({
  authAssertMock: vi.fn(),
  managerAssertMock: vi.fn(),
  changeLogInsertMock: vi.fn(),
  fromMock: vi.fn(),
  proposalsEqByIdMock: vi.fn(),
  proposalsUpdateMock: vi.fn(),
  rateCardsEqMock: vi.fn(),
  rateCardsSelectMock: vi.fn(),
  rateCardsReturnsMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  rpcMock: vi.fn(),
  scenarioEqByIdMock: vi.fn(),
  scenarioEqByProposalMock: vi.fn(),
  scenarioLinesEqMock: vi.fn(),
  scenarioLinesOrderMock: vi.fn(),
  scenarioLinesReturnsMock: vi.fn(),
  scenarioLinesSelectMock: vi.fn(),
  scenarioSingleMock: vi.fn(),
  scenariosSelectMock: vi.fn(),
  serviceHoursEqMock: vi.fn(),
  serviceHoursReturnsMock: vi.fn(),
  serviceHoursSelectMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: fromMock,
    rpc: rpcMock,
  })),
}));

vi.mock("@/lib/auth/require-admin", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/require-admin")>(
    "@/lib/auth/require-admin"
  );

  return {
    ...actual,
    assertAuthenticated: authAssertMock,
    assertManagerOrAdmin: managerAssertMock,
    // Mirror the real helpers but drive them from the same mocks so
    // existing resolve/reject setups keep working.
    requireAuthenticatedResult: async (message: string) => {
      try {
        const user = await authAssertMock();
        return { ok: true, user };
      } catch {
        return { ok: false, error: message };
      }
    },
    requireManagerOrAdminResult: async () => {
      try {
        const user = await managerAssertMock();
        return { ok: true, user };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },

  };
});

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

import { AuthError } from "@/lib/auth/require-admin";
import {
  closeProposalLost,
  closeProposalWon,
  correctClosedProposalFinancials,
  saveScenarioGridSelections,
  updateProposalStatus,
} from "./actions";

describe("proposal actions", () => {
  beforeEach(() => {
    authAssertMock.mockReset();
    managerAssertMock.mockReset();
    changeLogInsertMock.mockReset();
    fromMock.mockReset();
    proposalsEqByIdMock.mockReset();
    proposalsUpdateMock.mockReset();
    rateCardsEqMock.mockReset();
    rateCardsSelectMock.mockReset();
    rateCardsReturnsMock.mockReset();
    revalidatePathMock.mockReset();
    rpcMock.mockReset();
    scenarioEqByIdMock.mockReset();
    scenarioEqByProposalMock.mockReset();
    scenarioLinesEqMock.mockReset();
    scenarioLinesOrderMock.mockReset();
    scenarioLinesReturnsMock.mockReset();
    scenarioLinesSelectMock.mockReset();
    scenarioSingleMock.mockReset();
    scenariosSelectMock.mockReset();
    serviceHoursEqMock.mockReset();
    serviceHoursReturnsMock.mockReset();
    serviceHoursSelectMock.mockReset();

    authAssertMock.mockResolvedValue({ id: "user-1" });
    managerAssertMock.mockResolvedValue({ id: "manager-1" });

    proposalsUpdateMock.mockReturnValue({
      eq: proposalsEqByIdMock,
    });
    proposalsEqByIdMock.mockResolvedValue({ error: null });
    changeLogInsertMock.mockResolvedValue({ error: null });

    scenarioEqByProposalMock.mockReturnValue({
      single: scenarioSingleMock,
    });
    scenarioEqByIdMock.mockReturnValue({
      eq: scenarioEqByProposalMock,
    });
    scenariosSelectMock.mockReturnValue({
      eq: scenarioEqByIdMock,
    });

    scenarioLinesOrderMock.mockReturnValue({
      returns: scenarioLinesReturnsMock,
    });
    scenarioLinesEqMock.mockReturnValue({
      order: scenarioLinesOrderMock,
    });
    scenarioLinesSelectMock.mockReturnValue({
      eq: scenarioLinesEqMock,
    });

    serviceHoursEqMock.mockReturnValue({
      returns: serviceHoursReturnsMock,
    });
    serviceHoursSelectMock.mockReturnValue({
      eq: serviceHoursEqMock,
    });

    rateCardsEqMock.mockReturnValue({
      returns: rateCardsReturnsMock,
    });
    rateCardsSelectMock.mockReturnValue({
      eq: rateCardsEqMock,
    });

    fromMock.mockImplementation((table: string) => {
      if (table === "scenarios") {
        return { select: scenariosSelectMock };
      }
      if (table === "scenario_lines") {
        return { select: scenarioLinesSelectMock };
      }
      if (table === "service_hours") {
        return { select: serviceHoursSelectMock };
      }
      if (table === "rate_cards") {
        return { select: rateCardsSelectMock };
      }
      if (table === "proposals") {
        return { update: proposalsUpdateMock };
      }
      if (table === "change_log") {
        return { insert: changeLogInsertMock };
      }
      throw new Error(`Unexpected table mock: ${table}`);
    });
  });

  describe("updateProposalStatus", () => {
    it("rejects invalid statuses before calling Supabase", async () => {
      const result = await updateProposalStatus(
        "proposal-1",
        "Definitely Not Real"
      );

      expect(result).toEqual({
        ok: false,
        error: "Invalid status: Definitely Not Real",
      });
      expect(authAssertMock).not.toHaveBeenCalled();
      expect(rpcMock).not.toHaveBeenCalled();
    });

    it("rejects unauthenticated callers", async () => {
      authAssertMock.mockRejectedValue(
        new AuthError("UNAUTHENTICATED", "You must be signed in.")
      );

      const result = await updateProposalStatus("proposal-1", "Scoping");

      expect(result).toEqual({
        ok: false,
        error: "You must be signed in to change status.",
      });
      expect(rpcMock).not.toHaveBeenCalled();
    });

    it("calls the atomic database transition and revalidates on success", async () => {
      rpcMock.mockResolvedValue({
        data: true,
        error: null,
      });

      const result = await updateProposalStatus("proposal-1", "Scoping");

      expect(result).toEqual({ ok: true });
      expect(rpcMock).toHaveBeenCalledWith("transition_proposal_status", {
        p_proposal_id: "proposal-1",
        p_new_status: "Scoping",
      });
      expect(revalidatePathMock).toHaveBeenCalledWith("/proposals/proposal-1");
      expect(revalidatePathMock).toHaveBeenCalledWith("/proposals");
    });

    it("treats no-op transitions as success without revalidating", async () => {
      rpcMock.mockResolvedValue({
        data: false,
        error: null,
      });

      const result = await updateProposalStatus("proposal-1", "Discovery");

      expect(result).toEqual({ ok: true });
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });

    it("surfaces database errors cleanly", async () => {
      rpcMock.mockResolvedValue({
        data: null,
        error: {
          message: "Proposal not found or you do not have permission to edit it.",
        },
      });

      const result = await updateProposalStatus("proposal-1", "Scoping");

      expect(result).toEqual({
        ok: false,
        error: "Proposal not found or you do not have permission to edit it.",
      });
    });

    it("routes Closed Won through the closeout action", async () => {
      const result = await updateProposalStatus("proposal-1", "Closed Won");

      expect(result).toEqual({
        ok: false,
        error: "Closed Won requires closeout details.",
      });
      expect(rpcMock).not.toHaveBeenCalled();
    });
  });

  describe("proposal closeout actions", () => {
    beforeEach(() => {
      rpcMock.mockResolvedValue({ data: true, error: null });
    });

    it("rejects closing won without an LoE date", async () => {
      const result = await closeProposalWon("proposal-1", {
        soldPrice: 100000,
        loeValue: 100000,
        loeSignedDate: "",
        varianceReasonCode: "",
        varianceNote: "",
      });

      expect(result).toEqual({
        ok: false,
        error: "LoE signed date is required for Closed Won.",
      });
      expect(proposalsUpdateMock).not.toHaveBeenCalled();
    });

    it("rejects closing lost without reason and note", async () => {
      const result = await closeProposalLost("proposal-1", {
        closedLostReason: "",
        closedLostNote: "",
      });

      expect(result).toEqual({
        ok: false,
        error: "Closed Lost reason is required.",
      });
      expect(proposalsUpdateMock).not.toHaveBeenCalled();
    });

    it("requires reason and note when closing won under sold price", async () => {
      const result = await closeProposalWon("proposal-1", {
        soldPrice: 100000,
        loeValue: 90000,
        loeSignedDate: "2026-05-01",
        varianceReasonCode: "",
        varianceNote: "",
      });

      expect(result).toEqual({
        ok: false,
        error: "Variance reason is required when LoE value is under sold price.",
      });
      expect(proposalsUpdateMock).not.toHaveBeenCalled();
    });

    it("saves Closed Won closeout fields and transitions status", async () => {
      const result = await closeProposalWon("proposal-1", {
        soldPrice: 100000,
        loeValue: 100000,
        loeSignedDate: "2026-05-01",
        varianceReasonCode: "",
        varianceNote: "",
      });

      expect(result).toEqual({ ok: true });
      expect(proposalsUpdateMock).toHaveBeenCalledWith({
        sold_price: 100000,
        loe_value: 100000,
        loe_signed_date: "2026-05-01",
        variance_reason_code: null,
        variance_note: null,
        closed_lost_reason: null,
        closed_lost_note: null,
      });
      expect(rpcMock).toHaveBeenCalledWith("transition_proposal_status", {
        p_proposal_id: "proposal-1",
        p_new_status: "Closed Won",
      });
    });

    it("blocks SEs from correcting closed financials", async () => {
      managerAssertMock.mockRejectedValue(
        new AuthError("FORBIDDEN", "Manager or admin access required.")
      );

      const result = await correctClosedProposalFinancials("proposal-1", {
        soldPrice: 100000,
        loeValue: 95000,
        loeSignedDate: "2026-05-01",
        varianceReasonCode: "ae_discount",
        varianceNote: "Sr. AE discounted before signature.",
        correctionNote: "Fixing closeout typo.",
      });

      expect(result).toEqual({
        ok: false,
        error: "Manager or admin access required.",
      });
      expect(proposalsUpdateMock).not.toHaveBeenCalled();
    });

    it("allows managers to correct closed financials and writes change log", async () => {
      const result = await correctClosedProposalFinancials("proposal-1", {
        soldPrice: 100000,
        loeValue: 95000,
        loeSignedDate: "2026-05-01",
        varianceReasonCode: "ae_discount",
        varianceNote: "Sr. AE discounted before signature.",
        correctionNote: "Fixing closeout typo.",
      });

      expect(result).toEqual({ ok: true });
      expect(proposalsUpdateMock).toHaveBeenCalledWith({
        sold_price: 100000,
        loe_value: 95000,
        loe_signed_date: "2026-05-01",
        variance_reason_code: "ae_discount",
        variance_note: "Sr. AE discounted before signature.",
        closed_financials_corrected_at: expect.any(String),
        closed_financials_corrected_by: "manager-1",
      });
      expect(changeLogInsertMock).toHaveBeenCalledWith({
        proposal_id: "proposal-1",
        table_name: "proposals",
        record_id: "proposal-1",
        action: "UPDATE",
        changed_by: "manager-1",
        old_values: null,
        new_values: {
          correction_note: "Fixing closeout typo.",
          sold_price: 100000,
          loe_value: 95000,
          loe_signed_date: "2026-05-01",
          variance_reason_code: "ae_discount",
        },
      });
    });
  });

  describe("saveScenarioGridSelections", () => {
    beforeEach(() => {
      scenarioSingleMock.mockResolvedValue({
        data: {
          id: "11111111-1111-4111-8111-111111111111",
          proposal_id: "22222222-2222-4222-8222-222222222222",
          scenario_type: "P1",
        },
        error: null,
      });
      scenarioLinesReturnsMock.mockResolvedValue({
        data: [
          {
            id: "33333333-3333-4333-8333-333333333333",
            row_order: 0,
            module: "Module A",
            scope_selection: "Standard",
          },
        ],
        error: null,
      });
      serviceHoursReturnsMock.mockResolvedValue({
        data: [
          {
            service_name: "Module A",
            scope_value: "Standard",
            sr_im_hours: 10,
            pm_hours: 2,
            ba_hours: 1,
            scope_label: "Standard",
            service_group: "Core",
            lookup_key: "Module A|Standard",
          },
          {
            service_name: "Module A",
            scope_value: "Advanced",
            sr_im_hours: 14,
            pm_hours: 3,
            ba_hours: 0,
            scope_label: "Advanced",
            service_group: "Core",
            lookup_key: "Module A|Advanced",
          },
        ],
        error: null,
      });
      rateCardsReturnsMock.mockResolvedValue({
        data: [
          {
            activity: "Sr. Implementation Manager",
            rate: 100,
            role_category: "Labor",
            lookup_key: "Master|Sr. Implementation Manager",
          },
          {
            activity: "Program Manager",
            rate: 150,
            role_category: "Labor",
            lookup_key: "Master|Program Manager",
          },
          {
            activity: "Business Analyst",
            rate: 50,
            role_category: "Labor",
            lookup_key: "Master|Business Analyst",
          },
        ],
        error: null,
      });
    });

    it("rejects unauthenticated callers", async () => {
      authAssertMock.mockRejectedValue(
        new AuthError("UNAUTHENTICATED", "You must be signed in.")
      );

      const result = await saveScenarioGridSelections(
        "22222222-2222-4222-8222-222222222222",
        "11111111-1111-4111-8111-111111111111",
        [
          {
            lineId: "33333333-3333-4333-8333-333333333333",
            scopeSelection: "Advanced",
          },
        ]
      );

      expect(result).toEqual({
        ok: false,
        error: "You must be signed in to save scenario changes.",
      });
      expect(fromMock).not.toHaveBeenCalled();
    });

    it("rejects invalid scope selections before calling the RPC", async () => {
      const result = await saveScenarioGridSelections(
        "22222222-2222-4222-8222-222222222222",
        "11111111-1111-4111-8111-111111111111",
        [
          {
            lineId: "33333333-3333-4333-8333-333333333333",
            scopeSelection: "Definitely Invalid",
          },
        ]
      );

      expect(result).toEqual({
        ok: false,
        error: 'Invalid scope selection "Definitely Invalid" for module "Module A".',
      });
      expect(rpcMock).not.toHaveBeenCalled();
    });

    it("recomputes canonical lines, saves through the RPC, and revalidates on success", async () => {
      rpcMock.mockResolvedValue({
        data: true,
        error: null,
      });

      const result = await saveScenarioGridSelections(
        "22222222-2222-4222-8222-222222222222",
        "11111111-1111-4111-8111-111111111111",
        [
          {
            lineId: "33333333-3333-4333-8333-333333333333",
            scopeSelection: "Advanced",
          },
        ]
      );

      expect(result).toEqual({
        ok: true,
        lines: [
          {
            id: "33333333-3333-4333-8333-333333333333",
            rowOrder: 0,
            module: "Module A",
            scopeSelection: "Advanced",
            srImHours: 14,
            srImCost: 1400,
            pmHours: 3,
            pmCost: 450,
            baHours: 0,
            baCost: 0,
            totalHours: 17,
            totalCost: 1850,
          },
        ],
      });
      expect(rpcMock).toHaveBeenCalledWith("save_scenario_grid", {
        p_scenario_id: "11111111-1111-4111-8111-111111111111",
        p_lines: [
          {
            id: "33333333-3333-4333-8333-333333333333",
            scope_selection: "Advanced",
            sr_im_hours: 14,
            sr_im_cost: 1400,
            pm_hours: 3,
            pm_cost: 450,
            ba_hours: 0,
            ba_cost: 0,
            total_hours: 17,
            total_cost: 1850,
          },
        ],
        p_summary_total_hours: 17,
        p_summary_total_cost: 1850,
      });
      expect(revalidatePathMock).toHaveBeenCalledWith(
        "/proposals/22222222-2222-4222-8222-222222222222"
      );
      expect(revalidatePathMock).toHaveBeenCalledWith(
        "/proposals/22222222-2222-4222-8222-222222222222/scenarios/P1"
      );
    });

    it("surfaces RPC failures cleanly", async () => {
      rpcMock.mockResolvedValue({
        data: null,
        error: {
          message: "Scenario grid payload contains lines outside the target scenario.",
        },
      });

      const result = await saveScenarioGridSelections(
        "22222222-2222-4222-8222-222222222222",
        "11111111-1111-4111-8111-111111111111",
        [
          {
            lineId: "33333333-3333-4333-8333-333333333333",
            scopeSelection: "Advanced",
          },
        ]
      );

      expect(result).toEqual({
        ok: false,
        error: "Scenario grid payload contains lines outside the target scenario.",
      });
    });
  });
});
