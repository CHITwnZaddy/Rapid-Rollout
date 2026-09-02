import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock, verifyOtpMock, redirectMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  verifyOtpMock: vi.fn(),
  redirectMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

// The real redirect() throws NEXT_REDIRECT to unwind the request. Mocking it as
// a plain spy lets the action run to completion so the destination can be
// asserted directly.
vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

// Must import *after* the mocks are registered.
import { confirmEmailOtp } from "./actions";

const TOKEN = "token-hash-abc123";

function formDataWith(fields: Record<string, string>): FormData {
  const formData = new FormData();
  Object.entries(fields).forEach(([key, value]) => formData.set(key, value));
  return formData;
}

beforeEach(() => {
  createClientMock.mockReset();
  verifyOtpMock.mockReset();
  redirectMock.mockReset();

  verifyOtpMock.mockResolvedValue({ data: {}, error: null });
  createClientMock.mockResolvedValue({ auth: { verifyOtp: verifyOtpMock } });
});

describe("confirmEmailOtp", () => {
  it("sends a verified recovery link to the reset-worded form", async () => {
    await confirmEmailOtp(
      formDataWith({ token_hash: TOKEN, type: "recovery", next: "/set-password" })
    );

    expect(verifyOtpMock).toHaveBeenCalledWith({
      type: "recovery",
      token_hash: TOKEN,
    });
    // Derived from the type, not from `next` — so a Recovery email template
    // copied from the invite one still lands on recovery copy.
    expect(redirectMock).toHaveBeenCalledWith("/set-password?mode=recovery");
  });

  it("leaves the invite flow on its original destination", async () => {
    await confirmEmailOtp(
      formDataWith({ token_hash: TOKEN, type: "invite", next: "/set-password" })
    );

    expect(verifyOtpMock).toHaveBeenCalledWith({
      type: "invite",
      token_hash: TOKEN,
    });
    expect(redirectMock).toHaveBeenCalledWith("/set-password");
  });

  it("carries the type to the error page when verification fails", async () => {
    verifyOtpMock.mockResolvedValue({
      data: null,
      error: { message: "Token has expired or is invalid" },
    });

    await confirmEmailOtp(formDataWith({ token_hash: TOKEN, type: "recovery" }));

    // Lets /auth-error offer a new reset link instead of "ask an admin".
    expect(redirectMock).toHaveBeenCalledWith("/auth-error?type=recovery");
  });

  it("rejects an unknown type without calling Supabase or reflecting it", async () => {
    await confirmEmailOtp(
      formDataWith({ token_hash: TOKEN, type: "not-a-real-type" })
    );

    expect(createClientMock).not.toHaveBeenCalled();
    expect(verifyOtpMock).not.toHaveBeenCalled();
    // Only a validated OTP type is ever echoed into the query string.
    expect(redirectMock).toHaveBeenCalledWith("/auth-error");
  });

  it("falls back to the dashboard for an open-redirect attempt", async () => {
    await confirmEmailOtp(
      formDataWith({
        token_hash: TOKEN,
        type: "recovery",
        next: "//evil.com/set-password",
      })
    );

    expect(redirectMock).toHaveBeenCalledWith("/dashboard?mode=recovery");
  });
});
