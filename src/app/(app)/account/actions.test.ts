import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireAuthenticatedResultMock,
  createClientMock,
  updateUserMock,
  signOutMock,
  revalidatePathMock,
  consoleErrorMock,
} = vi.hoisted(() => ({
  requireAuthenticatedResultMock: vi.fn(),
  createClientMock: vi.fn(),
  updateUserMock: vi.fn(),
  signOutMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  consoleErrorMock: vi.fn(),
}));

vi.mock("@/lib/auth/require-admin", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/auth/require-admin")
  >("@/lib/auth/require-admin");
  return {
    ...actual,
    requireAuthenticatedResult: requireAuthenticatedResultMock,
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

// Must import *after* the mocks are registered.
import { changePassword, submitChangePassword } from "./actions";

const CURRENT = "old-password-1";
const NEXT = "new-password-1";

function formDataWith(fields: Record<string, string>): FormData {
  const formData = new FormData();
  Object.entries(fields).forEach(([key, value]) => formData.set(key, value));
  return formData;
}

function validForm(overrides: Record<string, string> = {}): FormData {
  return formDataWith({
    currentPassword: CURRENT,
    password: NEXT,
    confirmPassword: NEXT,
    ...overrides,
  });
}

beforeEach(() => {
  requireAuthenticatedResultMock.mockReset();
  createClientMock.mockReset();
  updateUserMock.mockReset();
  signOutMock.mockReset();
  revalidatePathMock.mockReset();
  consoleErrorMock.mockReset();

  requireAuthenticatedResultMock.mockResolvedValue({
    ok: true,
    user: { id: "user-1", email: "austin@example.com" },
  });
  updateUserMock.mockResolvedValue({ data: {}, error: null });
  signOutMock.mockResolvedValue({ error: null });
  createClientMock.mockResolvedValue({
    auth: { updateUser: updateUserMock, signOut: signOutMock },
  });
  vi.spyOn(console, "error").mockImplementation(consoleErrorMock);
});

describe("changePassword", () => {
  it("rejects an unauthenticated caller before touching Supabase", async () => {
    requireAuthenticatedResultMock.mockResolvedValue({
      ok: false,
      error: "You must be signed in to change your password.",
    });

    const result = await changePassword(validForm());

    expect(result).toEqual({
      ok: false,
      error: "You must be signed in to change your password.",
    });
    expect(createClientMock).not.toHaveBeenCalled();
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it("rejects a weak or mismatched new password before touching Supabase", async () => {
    const tooShort = await changePassword(
      validForm({ password: "short", confirmPassword: "short" })
    );
    expect(tooShort).toEqual({
      ok: false,
      error: "Password must be at least 8 characters.",
    });

    const mismatched = await changePassword(
      validForm({ confirmPassword: "something-else-1" })
    );
    expect(mismatched).toEqual({ ok: false, error: "Passwords do not match." });

    expect(updateUserMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("sends the current password, revokes other sessions, and revalidates", async () => {
    const result = await changePassword(validForm());

    expect(result).toEqual({ ok: true, changed: true });
    // snake_case is the only spelling the installed auth-js accepts.
    expect(updateUserMock).toHaveBeenCalledWith({
      password: NEXT,
      current_password: CURRENT,
    });
    // "others" keeps this session alive while invalidating any stolen one.
    expect(signOutMock).toHaveBeenCalledWith({ scope: "others" });
    expect(revalidatePathMock).toHaveBeenCalledWith("/account");
  });

  it("returns a generic message when Supabase rejects the change", async () => {
    updateUserMock.mockResolvedValue({
      data: null,
      error: { message: "New password should be different from the old password." },
    });

    const result = await changePassword(validForm());

    expect(result).toEqual({
      ok: false,
      error:
        "Could not update your password. Check your current password and try again.",
    });
    // The raw message would confirm a guessed current password to whoever
    // holds a stolen session.
    expect(JSON.stringify(result)).not.toContain("should be different");
    expect(consoleErrorMock).toHaveBeenCalledWith(
      "Password change failed",
      "New password should be different from the old password."
    );
    expect(signOutMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("still succeeds if revoking other sessions fails", async () => {
    signOutMock.mockResolvedValue({ error: { message: "network blip" } });

    const result = await changePassword(validForm());

    // The password has already changed; failing the action here would tell the
    // user it did not work and invite a confusing retry.
    expect(result).toEqual({ ok: true, changed: true });
    expect(consoleErrorMock).toHaveBeenCalledWith(
      "Could not revoke other sessions after password change",
      "network blip"
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/account");
  });

  it("mirrors the result through the useActionState wrapper", async () => {
    await expect(
      submitChangePassword({ ok: true, changed: false }, validForm())
    ).resolves.toEqual({ ok: true, changed: true });
  });
});
