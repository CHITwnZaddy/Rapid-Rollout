import { describe, expect, it } from "vitest";
import {
  isAdminRole,
  isAppRole,
  isManagerRole,
  isManagerOrAdminRole,
} from "../roles";

describe("auth roles", () => {
  it.each(["admin", "manager", "user", undefined])(
    "classifies role %s",
    (role) => {
      expect(isAdminRole(role)).toBe(role === "admin");
      expect(isManagerRole(role)).toBe(role === "manager");
      expect(isManagerOrAdminRole(role)).toBe(
        role === "admin" || role === "manager"
      );
      expect(isAppRole(role)).toBe(role !== undefined);
    }
  );

  it("rejects values outside the app role set", () => {
    expect(isAppRole("superuser")).toBe(false);
    expect(isAppRole(null)).toBe(false);
    expect(isAppRole(1)).toBe(false);
  });
});
