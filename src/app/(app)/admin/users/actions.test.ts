import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthError } from "@/lib/auth/require-admin";

const {
  assertAdminMock,
  createAdminClientMock,
  revalidatePathMock,
  inviteUserByEmailMock,
  updateUserByIdMock,
  deleteUserMock,
  listUsersMock,
} = vi.hoisted(() => ({
  assertAdminMock: vi.fn(),
  createAdminClientMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  inviteUserByEmailMock: vi.fn(),
  updateUserByIdMock: vi.fn(),
  deleteUserMock: vi.fn(),
  listUsersMock: vi.fn(),
}));

vi.mock("@/lib/auth/require-admin", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/require-admin")>(
    "@/lib/auth/require-admin"
  );
  return {
    ...actual,
    assertAdmin: assertAdminMock,
  };
});

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

import { deleteUser, inviteUser, listUsers, updateUserRole } from "./actions";

const invitedUserId = "44444444-4444-4444-8444-444444444444";
const otherUserId = "55555555-5555-4555-8555-555555555555";
const callerId = "11111111-1111-4111-8111-111111111111";
const invitedUser = {
  id: invitedUserId,
  email: "se@company.com",
  app_metadata: {},
  created_at: "2026-10-22T16:00:00.000Z",
  last_sign_in_at: null,
};

beforeEach(() => {
  assertAdminMock.mockReset();
  createAdminClientMock.mockReset();
  revalidatePathMock.mockReset();
  inviteUserByEmailMock.mockReset();
  updateUserByIdMock.mockReset();
  deleteUserMock.mockReset();
  listUsersMock.mockReset();

  assertAdminMock.mockResolvedValue({
    id: callerId,
    app_metadata: { role: "admin" },
  });
  inviteUserByEmailMock.mockResolvedValue({
    data: { user: invitedUser },
    error: null,
  });
  updateUserByIdMock.mockResolvedValue({ data: {}, error: null });
  deleteUserMock.mockResolvedValue({ data: {}, error: null });
  listUsersMock.mockResolvedValue({ data: { users: [] }, error: null });
  createAdminClientMock.mockReturnValue({
    auth: {
      admin: {
        inviteUserByEmail: inviteUserByEmailMock,
        updateUserById: updateUserByIdMock,
        deleteUser: deleteUserMock,
        listUsers: listUsersMock,
      },
    },
  });
});

describe("listUsers", () => {
  it("requests the maximum page size and hides soft-deleted accounts", async () => {
    listUsersMock.mockResolvedValue({
      data: {
        users: [
          { ...invitedUser, app_metadata: { role: "manager" } },
          {
            id: otherUserId,
            email: "gone@company.com",
            app_metadata: { role: "admin" },
            created_at: "2026-01-01T00:00:00.000Z",
            last_sign_in_at: null,
            deleted_at: "2026-10-01T00:00:00.000Z",
          },
        ],
      },
      error: null,
    });

    const users = await listUsers();

    expect(listUsersMock).toHaveBeenCalledWith({ page: 1, perPage: 1000 });
    expect(users).toEqual([
      {
        id: invitedUserId,
        email: "se@company.com",
        role: "manager",
        createdAt: "2026-10-22T16:00:00.000Z",
        lastSignIn: null,
      },
    ]);
  });
});

describe("inviteUser", () => {
  it("returns the invited account so the client can show it immediately", async () => {
    const result = await inviteUser("se@company.com", "user");

    expect(result).toEqual({
      ok: true,
      user: {
        id: invitedUserId,
        email: "se@company.com",
        role: null,
        createdAt: "2026-10-22T16:00:00.000Z",
        lastSignIn: null,
      },
    });
  });

  it("promotes an invited admin via app_metadata, not user_metadata", async () => {
    const result = await inviteUser("se@company.com", "admin");

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        user: expect.objectContaining({ id: invitedUserId, role: "admin" }),
      })
    );
    expect(inviteUserByEmailMock).toHaveBeenCalledWith("se@company.com");
    // The role must never be passed as invite `data` (which lands in
    // user_metadata and grants no privileges).
    expect(inviteUserByEmailMock).not.toHaveBeenCalledWith(
      "se@company.com",
      expect.objectContaining({ data: expect.anything() })
    );
    expect(updateUserByIdMock).toHaveBeenCalledWith(invitedUserId, {
      app_metadata: { role: "admin" },
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/users");
  });

  it("does not set any app_metadata role for a plain user invite", async () => {
    const result = await inviteUser("se@company.com", "user");

    expect(result.ok).toBe(true);
    expect(inviteUserByEmailMock).toHaveBeenCalledWith("se@company.com");
    expect(updateUserByIdMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/users");
  });

  it("stores the manager role in app_metadata", async () => {
    const result = await inviteUser("se@company.com", "manager");

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        user: expect.objectContaining({ role: "manager" }),
      })
    );
    expect(updateUserByIdMock).toHaveBeenCalledWith(invitedUserId, {
      app_metadata: { role: "manager" },
    });
  });

  it("returns a failure result for a non-admin caller before touching the admin client", async () => {
    assertAdminMock.mockRejectedValue(
      new AuthError("FORBIDDEN", "Admin access required.")
    );

    const result = await inviteUser("se@company.com", "admin");

    expect(result).toEqual({ ok: false, error: "Admin access required." });
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it("returns a validation failure for an invalid email without inviting", async () => {
    const result = await inviteUser("not-an-email", "user");

    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.error).toContain("valid email address");
    expect(inviteUserByEmailMock).not.toHaveBeenCalled();
  });

  it("surfaces a failure to set the admin role and does not revalidate", async () => {
    updateUserByIdMock.mockResolvedValue({
      data: null,
      error: { message: "role write failed" },
    });

    const result = await inviteUser("se@company.com", "admin");

    expect(result).toEqual({ ok: false, error: "role write failed" });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

describe("updateUserRole", () => {
  it("updates a role and returns ok", async () => {
    const result = await updateUserRole(otherUserId, "admin");

    expect(result).toEqual({ ok: true });
    expect(updateUserByIdMock).toHaveBeenCalledWith(otherUserId, {
      app_metadata: { role: "admin" },
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/users");
  });

  // GoTrue merges app_metadata key by key; an empty object leaves the old
  // role in place. Demotion must explicitly null the key.
  it("demotes to a plain user by clearing the role claim", async () => {
    const result = await updateUserRole(otherUserId, "user");

    expect(result).toEqual({ ok: true });
    expect(updateUserByIdMock).toHaveBeenCalledWith(otherUserId, {
      app_metadata: { role: null },
    });
  });

  it("can grant the manager role", async () => {
    const result = await updateUserRole(otherUserId, "manager");

    expect(result).toEqual({ ok: true });
    expect(updateUserByIdMock).toHaveBeenCalledWith(otherUserId, {
      app_metadata: { role: "manager" },
    });
  });

  it("blocks an admin from removing their own admin role", async () => {
    const result = await updateUserRole(callerId, "user");

    expect(result).toEqual({
      ok: false,
      error: "You cannot remove your own admin role.",
    });
    expect(updateUserByIdMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

describe("deleteUser", () => {
  // Soft delete: a hard delete is rejected by the NO ACTION foreign keys on
  // proposal_status_history.changed_by et al. for any user who ever created a
  // proposal or changed a status.
  it("soft-deletes another user and returns ok", async () => {
    const result = await deleteUser(otherUserId);

    expect(result).toEqual({ ok: true });
    expect(deleteUserMock).toHaveBeenCalledWith(otherUserId, true);
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/users");
  });

  it("blocks an admin from deleting their own account", async () => {
    const result = await deleteUser(callerId);

    expect(result).toEqual({
      ok: false,
      error: "You cannot delete your own account here.",
    });
    expect(deleteUserMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
