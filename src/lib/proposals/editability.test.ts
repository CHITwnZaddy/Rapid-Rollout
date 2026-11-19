import { describe, expect, it } from "vitest";
import { getProposalEditability } from "./editability";

const OWNER_ID = "user-owner";
const OTHER_ID = "user-other";

describe("getProposalEditability", () => {
  it("lets the owner edit and delete", () => {
    for (const role of [undefined, "user"]) {
      expect(
        getProposalEditability({ userId: OWNER_ID, role, createdBy: OWNER_ID })
      ).toEqual({
        canEdit: true,
        canDelete: true,
        isOwner: true,
      });
    }
  });

  it("lets another SE edit (as a backup) but not delete", () => {
    expect(
      getProposalEditability({ userId: OTHER_ID, role: "user", createdBy: OWNER_ID })
    ).toEqual({
      canEdit: true,
      canDelete: false,
      isOwner: false,
    });
  });

  it("lets a non-owner manager edit but not delete", () => {
    expect(
      getProposalEditability({ userId: OTHER_ID, role: "manager", createdBy: OWNER_ID })
    ).toEqual({
      canEdit: true,
      canDelete: false,
      isOwner: false,
    });
  });

  it("lets a manager who owns the proposal edit and delete", () => {
    expect(
      getProposalEditability({ userId: OWNER_ID, role: "manager", createdBy: OWNER_ID })
    ).toEqual({
      canEdit: true,
      canDelete: true,
      isOwner: true,
    });
  });

  it("lets a non-owner admin edit and delete", () => {
    expect(
      getProposalEditability({ userId: OTHER_ID, role: "admin", createdBy: OWNER_ID })
    ).toEqual({
      canEdit: true,
      canDelete: true,
      isOwner: false,
    });
  });

  it("lets an admin who owns the proposal edit and delete", () => {
    expect(
      getProposalEditability({ userId: OWNER_ID, role: "admin", createdBy: OWNER_ID })
    ).toEqual({
      canEdit: true,
      canDelete: true,
      isOwner: true,
    });
  });

  it("treats a missing or unrecognised role on a non-owner as a plain SE", () => {
    for (const role of [undefined, null, "", "superuser", 42]) {
      expect(
        getProposalEditability({ userId: OTHER_ID, role, createdBy: OWNER_ID })
      ).toEqual({
        canEdit: true,
        canDelete: false,
        isOwner: false,
      });
    }
  });

  it("gives a signed-out viewer no access, whatever the role claim says", () => {
    for (const role of [undefined, "user", "manager", "admin"]) {
      expect(
        getProposalEditability({ userId: null, role, createdBy: OWNER_ID })
      ).toEqual({
        canEdit: false,
        canDelete: false,
        isOwner: false,
      });
    }
  });

  it("does not match a null userId against a null created_by", () => {
    expect(
      getProposalEditability({ userId: null, role: undefined, createdBy: null })
    ).toEqual({
      canEdit: false,
      canDelete: false,
      isOwner: false,
    });
  });

  it("lets an SE edit but not delete a proposal with no created_by", () => {
    expect(
      getProposalEditability({ userId: OTHER_ID, role: "user", createdBy: null })
    ).toEqual({
      canEdit: true,
      canDelete: false,
      isOwner: false,
    });
  });

  it("lets an admin edit and delete a proposal with no created_by", () => {
    expect(
      getProposalEditability({ userId: OTHER_ID, role: "admin", createdBy: null })
    ).toEqual({
      canEdit: true,
      canDelete: true,
      isOwner: false,
    });
  });
});
