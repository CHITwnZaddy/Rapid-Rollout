import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthError } from "@/lib/auth/require-admin";

const {
  assertAdminMock,
  createAdminClientMock,
  revalidatePathMock,
  inviteUserByEmailMock,
  updateUserByIdMock,
  deleteUserMock,
} = vi.hoisted(() => ({
  assertAdminMock: vi.fn(),
  createAdminClientMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  inviteUserByEmailMock: vi.fn(),
  updateUserByIdMock: vi.fn(),
  deleteUserMock: vi.fn(),
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

import { deleteUser, inviteUser, updateUserRole } from "./actions";

const invitedUserId = "44444444-4444-4444-8444-444444444444";
const otherUserId = "55555555-5555-4555-8555-555555555555";
const callerId = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  assertAdminMock.mockReset();
  createAdminClientMock.mockReset();
  revalidatePathMock.mockReset();
  inviteUserByEmailMock.mockReset();
  updateUserByIdMock.mockReset();
  deleteUserMock.mockReset();

  assertAdminMock.mockResolvedValue({
    id: callerId,
    app_metadata: { role: "admin" },
  });
  inviteUserByEmailMock.mockResolvedValue({
    data: { user: { id: invitedUserId } },
    error: null,
  });
  updateUserByIdMock.mockResolvedValue({ data: {}, error: null });
  deleteUserMock.mockResolvedValue({ data: {}, error: null });
  createAdminClientMock.mockReturnValue({
    auth: {
      admin: {
        inviteUserByEmail: inviteUserByEmailMock,
        updateUserById: updateUserByIdMock,
        deleteUser: deleteUserMock,
      },
    },
  });
});

describe("inviteUser", () => {
  it("promotes an invited admin via app_metadata, not user_metadata", async () => {
    const result = await inviteUser("se@company.com", "admin");

    expect(result).toEqual({ ok: true });
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

    expect(result).toEqual({ ok: true });
    expect(inviteUserByEmailMock).toHaveBeenCalledWith("se@company.com");
    expect(updateUserByIdMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/users");
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
  it("deletes another user and returns ok", async () => {
    const result = await deleteUser(otherUserId);

    expect(result).toEqual({ ok: true });
    expect(deleteUserMock).toHaveBeenCalledWith(otherUserId);
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
