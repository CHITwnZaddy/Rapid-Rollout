import { describe, expect, it } from "vitest";
import { getProposalEditability } from "./editability";

const OWNER_ID = "user-owner";
const OTHER_ID = "user-other";

describe("getProposalEditability", () => {
  it("lets the owner edit content, change status and delete", () => {
    expect(
      getProposalEditability({ userId: OWNER_ID, role: undefined, createdBy: OWNER_ID })
    ).toEqual({
      canEditContent: true,
      canChangeStatus: true,
      canDelete: true,
      isOwner: true,
    });
  });

  it("treats an owner with an explicit user role as the owner", () => {
    expect(
      getProposalEditability({ userId: OWNER_ID, role: "user", createdBy: OWNER_ID })
    ).toEqual({
      canEditContent: true,
      canChangeStatus: true,
      canDelete: true,
      isOwner: true,
    });
  });

  it("gives another SE no write access", () => {
    expect(
      getProposalEditability({ userId: OTHER_ID, role: "user", createdBy: OWNER_ID })
    ).toEqual({
      canEditContent: false,
      canChangeStatus: false,
      canDelete: false,
      isOwner: false,
    });
  });

  it("lets a non-owner manager change status only", () => {
    expect(
      getProposalEditability({ userId: OTHER_ID, role: "manager", createdBy: OWNER_ID })
    ).toEqual({
      canEditContent: false,
      canChangeStatus: true,
      canDelete: false,
      isOwner: false,
    });
  });

  it("gives a manager who owns the proposal full access", () => {
    expect(
      getProposalEditability({ userId: OWNER_ID, role: "manager", createdBy: OWNER_ID })
    ).toEqual({
      canEditContent: true,
      canChangeStatus: true,
      canDelete: true,
      isOwner: true,
    });
  });

  it("gives a non-owner admin full access", () => {
    expect(
      getProposalEditability({ userId: OTHER_ID, role: "admin", createdBy: OWNER_ID })
    ).toEqual({
      canEditContent: true,
      canChangeStatus: true,
      canDelete: true,
      isOwner: false,
    });
  });

  it("gives an admin who owns the proposal full access", () => {
    expect(
      getProposalEditability({ userId: OWNER_ID, role: "admin", createdBy: OWNER_ID })
    ).toEqual({
      canEditContent: true,
      canChangeStatus: true,
      canDelete: true,
      isOwner: true,
    });
  });

  it("treats a missing or unrecognised role as a plain user", () => {
    for (const role of [undefined, null, "", "superuser", 42]) {
      expect(
        getProposalEditability({ userId: OTHER_ID, role, createdBy: OWNER_ID })
      ).toEqual({
        canEditContent: false,
        canChangeStatus: false,
        canDelete: false,
        isOwner: false,
      });
    }
  });

  it("never treats a signed-out viewer as the owner", () => {
    expect(
      getProposalEditability({ userId: null, role: undefined, createdBy: OWNER_ID })
    ).toEqual({
      canEditContent: false,
      canChangeStatus: false,
      canDelete: false,
      isOwner: false,
    });
  });

  it("does not match a null userId against a null created_by", () => {
    expect(
      getProposalEditability({ userId: null, role: undefined, createdBy: null })
    ).toEqual({
      canEditContent: false,
      canChangeStatus: false,
      canDelete: false,
      isOwner: false,
    });
  });

  it("does not make anyone the owner of a proposal with no created_by", () => {
    expect(
      getProposalEditability({ userId: OTHER_ID, role: "user", createdBy: null })
    ).toMatchObject({ canEditContent: false, isOwner: false });
    expect(
      getProposalEditability({ userId: OTHER_ID, role: "admin", createdBy: null })
    ).toMatchObject({ canEditContent: true, canDelete: true, isOwner: false });
  });
});
