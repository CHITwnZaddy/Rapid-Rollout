import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authAssertMock,
  fromMock,
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
  fromMock: vi.fn(),
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
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

import { AuthError } from "@/lib/auth/require-admin";
import { saveScenarioGridSelections, updateProposalStatus } from "./actions";

describe("proposal actions", () => {
  beforeEach(() => {
    authAssertMock.mockReset();
    fromMock.mockReset();
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

      const result = await updateProposalStatus("proposal-1", "Won");

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

      const result = await updateProposalStatus("proposal-1", "Won");

      expect(result).toEqual({ ok: true });
      expect(rpcMock).toHaveBeenCalledWith("transition_proposal_status", {
        p_proposal_id: "proposal-1",
        p_new_status: "Won",
      });
      expect(revalidatePathMock).toHaveBeenCalledWith("/proposals/proposal-1");
      expect(revalidatePathMock).toHaveBeenCalledWith("/proposals");
    });

    it("treats no-op transitions as success without revalidating", async () => {
      rpcMock.mockResolvedValue({
        data: false,
        error: null,
      });

      const result = await updateProposalStatus("proposal-1", "Draft");

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

      const result = await updateProposalStatus("proposal-1", "Won");

      expect(result).toEqual({
        ok: false,
        error: "Proposal not found or you do not have permission to edit it.",
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
