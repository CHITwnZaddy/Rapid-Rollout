import { describe, expect, it } from "vitest";
import { z } from "zod";
import * as parseHelpers from "./parse-supabase";
import { safeParseSupabaseResult } from "./parse-supabase";

describe("safeParseSupabaseResult", () => {
  it("keeps safeParseSupabaseResult as the only public parser", () => {
    expect(Object.keys(parseHelpers)).toEqual(["safeParseSupabaseResult"]);
  });

  it("returns parsed data when Supabase and Zod both succeed", () => {
    const result = safeParseSupabaseResult(z.object({ name: z.string() }), {
      data: { name: "Acme" },
      error: null,
    });

    expect(result).toEqual({ ok: true, data: { name: "Acme" } });
  });

  it("returns Supabase error messages without throwing", () => {
    const result = safeParseSupabaseResult(z.object({ name: z.string() }), {
      data: null,
      error: { message: "permission denied" },
    });

    expect(result).toEqual({ ok: false, error: "permission denied" });
  });

  it("returns Zod error messages without throwing", () => {
    const result = safeParseSupabaseResult(z.object({ name: z.string() }), {
      data: { name: 123 },
      error: null,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Invalid input");
    }
  });
});
