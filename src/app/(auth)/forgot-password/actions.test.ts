import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock, resetPasswordForEmailMock, consoleErrorMock } =
  vi.hoisted(() => ({
    createClientMock: vi.fn(),
    resetPasswordForEmailMock: vi.fn(),
    consoleErrorMock: vi.fn(),
  }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

// Must import *after* the mock is registered.
import { requestPasswordReset, submitRequestPasswordReset } from "./actions";

function formDataWith(email: string): FormData {
  const formData = new FormData();
  formData.set("email", email);
  return formData;
}

beforeEach(() => {
  createClientMock.mockReset();
  resetPasswordForEmailMock.mockReset();
  consoleErrorMock.mockReset();

  resetPasswordForEmailMock.mockResolvedValue({ data: {}, error: null });
  createClientMock.mockResolvedValue({
    auth: { resetPasswordForEmail: resetPasswordForEmailMock },
  });
  vi.spyOn(console, "error").mockImplementation(consoleErrorMock);
});

describe("requestPasswordReset", () => {
  it("sends the reset with a normalised address and no redirect option", async () => {
    const result = await requestPasswordReset(
      formDataWith("  Austin@Example.COM  ")
    );

    expect(result).toEqual({ ok: true, sent: true });
    // Exactly one argument: passing redirectTo would require the URL on the
    // project's allowlist and is unused by the token_hash template.
    expect(resetPasswordForEmailMock).toHaveBeenCalledWith("austin@example.com");
    expect(resetPasswordForEmailMock.mock.calls[0]).toHaveLength(1);
  });

  it("still reports success when Supabase fails, and does not leak why", async () => {
    resetPasswordForEmailMock.mockResolvedValue({
      data: null,
      error: { message: "email rate limit exceeded" },
    });

    const result = await requestPasswordReset(formDataWith("austin@example.com"));

    // Load-bearing: surfacing the error would enable user enumeration and
    // expose the shared-sender rate limit as a scary message.
    expect(result).toEqual({ ok: true, sent: true });
    expect(JSON.stringify(result)).not.toContain("rate limit");
    expect(consoleErrorMock).toHaveBeenCalledWith(
      "Password reset request failed",
      "email rate limit exceeded"
    );
  });

  it("rejects a malformed address before touching Supabase", async () => {
    const result = await requestPasswordReset(formDataWith("not-an-email"));

    expect(result).toEqual({
      ok: false,
      error: "Please enter a valid email address.",
    });
    expect(createClientMock).not.toHaveBeenCalled();
    expect(resetPasswordForEmailMock).not.toHaveBeenCalled();
  });

  it("mirrors both outcomes through the useActionState wrapper", async () => {
    const initial = { ok: true, sent: false } as const;

    await expect(
      submitRequestPasswordReset(initial, formDataWith("austin@example.com"))
    ).resolves.toEqual({ ok: true, sent: true });

    await expect(
      submitRequestPasswordReset(initial, formDataWith("nope"))
    ).resolves.toEqual({
      ok: false,
      error: "Please enter a valid email address.",
    });
  });
});
