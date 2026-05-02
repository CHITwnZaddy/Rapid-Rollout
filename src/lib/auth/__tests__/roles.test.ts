import { describe, expect, it } from "vitest";
import { isAdminRole, isManagerRole, isManagerOrAdminRole } from "../roles";

describe("auth roles", () => {
  it.each(["admin", "manager", "user", undefined])(
    "classifies role %s",
    (role) => {
      expect(isAdminRole(role)).toBe(role === "admin");
      expect(isManagerRole(role)).toBe(role === "manager");
      expect(isManagerOrAdminRole(role)).toBe(
        role === "admin" || role === "manager"
      );
    }
  );
});
