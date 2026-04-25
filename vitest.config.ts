import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      reportsDirectory: "./coverage",
      // 60% line baseline is intentionally NOT enforced here. Vitest v4
      // sets process.exitCode = 1 on threshold failure, which would fail
      // the build. This PR is visibility-only — the baseline is tracked
      // in the PR description and reviewed via the uploaded artifact.
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
