import { describe, expect, it } from "vitest";
import {
  isAuthenticatedRedirectPath,
  isPublicPath,
} from "@/lib/auth/public-paths";

describe("isPublicPath", () => {
  it("allows the routes a session-less visitor must reach", () => {
    expect(isPublicPath("/")).toBe(true);
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/forgot-password")).toBe(true);
    expect(isPublicPath("/auth/confirm")).toBe(true);
    expect(isPublicPath("/auth-error")).toBe(true);
  });

  it("keeps /set-password and the app protected", () => {
    // /set-password is reached only after /auth/confirm establishes a session.
    // Making it public would show a session-less visitor a form that cannot
    // work instead of bouncing them to /login.
    expect(isPublicPath("/set-password")).toBe(false);
    expect(isPublicPath("/dashboard")).toBe(false);
    expect(isPublicPath("/admin/users")).toBe(false);
    expect(isPublicPath("/proposals/123")).toBe(false);
  });

  it("matches exactly, so no unrelated path inherits the exemption", () => {
    // The previous inline check used startsWith("/auth") / startsWith("/login"),
    // which would have exempted all of these.
    expect(isPublicPath("/authors/1")).toBe(false);
    expect(isPublicPath("/authfoo")).toBe(false);
    expect(isPublicPath("/loginfoo")).toBe(false);
    expect(isPublicPath("/auth/some-future-route")).toBe(false);
  });
});

describe("isAuthenticatedRedirectPath", () => {
  it("sends signed-in users away from the sign-in surfaces", () => {
    expect(isAuthenticatedRedirectPath("/login")).toBe(true);
    expect(isAuthenticatedRedirectPath("/forgot-password")).toBe(true);
  });

  it("never redirects away from /auth/confirm", () => {
    // Load-bearing: a user already signed in on this browser who clicks a
    // recovery or invite link must still be able to run verifyOtp. Redirecting
    // them to /dashboard would burn the single-use token on their next click.
    expect(isAuthenticatedRedirectPath("/auth/confirm")).toBe(false);
    expect(isAuthenticatedRedirectPath("/auth-error")).toBe(false);
    expect(isAuthenticatedRedirectPath("/set-password")).toBe(false);
  });
});
