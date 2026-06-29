import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthError } from "@/lib/auth/require-admin";

const {
  assertAdminMock,
  createAdminClientMock,
  revalidatePathMock,
  inviteUserByEmailMock,
  updateUserByIdMock,
} = vi.hoisted(() => ({
  assertAdminMock: vi.fn(),
  createAdminClientMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  inviteUserByEmailMock: vi.fn(),
  updateUserByIdMock: vi.fn(),
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

import { inviteUser } from "./actions";

const invitedUserId = "44444444-4444-4444-8444-444444444444";

beforeEach(() => {
  assertAdminMock.mockReset();
  createAdminClientMock.mockReset();
  revalidatePathMock.mockReset();
  inviteUserByEmailMock.mockReset();
  updateUserByIdMock.mockReset();

  assertAdminMock.mockResolvedValue({
    id: "admin-1",
    app_metadata: { role: "admin" },
  });
  inviteUserByEmailMock.mockResolvedValue({
    data: { user: { id: invitedUserId } },
    error: null,
  });
  updateUserByIdMock.mockResolvedValue({ data: {}, error: null });
  createAdminClientMock.mockReturnValue({
    auth: {
      admin: {
        inviteUserByEmail: inviteUserByEmailMock,
        updateUserById: updateUserByIdMock,
      },
    },
  });
});

describe("inviteUser", () => {
  it("promotes an invited admin via app_metadata, not user_metadata", async () => {
    await inviteUser("se@company.com", "admin");

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
    await inviteUser("se@company.com", "user");

    expect(inviteUserByEmailMock).toHaveBeenCalledWith("se@company.com");
    expect(updateUserByIdMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/users");
  });

  it("rejects a non-admin caller before touching the admin client", async () => {
    assertAdminMock.mockRejectedValue(
      new AuthError("FORBIDDEN", "Admin access required.")
    );

    await expect(inviteUser("se@company.com", "admin")).rejects.toThrow(
      "Admin access required."
    );
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid email without inviting", async () => {
    await expect(inviteUser("not-an-email", "user")).rejects.toThrow(
      "valid email address"
    );
    expect(inviteUserByEmailMock).not.toHaveBeenCalled();
  });

  it("surfaces a failure to set the admin role", async () => {
    updateUserByIdMock.mockResolvedValue({
      data: null,
      error: { message: "role write failed" },
    });

    await expect(inviteUser("se@company.com", "admin")).rejects.toThrow(
      "role write failed"
    );
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
