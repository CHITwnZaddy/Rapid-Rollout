import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMigrationPersistenceController } from "./migration-persistence";

describe("createMigrationPersistenceController", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("persists both config and line edits when config changes first", async () => {
    const callOrder: string[] = [];
    const snapshot = {
      config: { id: "cfg-1", num_projects: 2 },
      lines: [{ id: "line-1", quantity: 5 }],
    };

    const controller = createMigrationPersistenceController({
      debounceMs: 50,
      getSnapshot: () => snapshot,
      saveConfig: vi.fn(async () => {
        callOrder.push("config");
      }),
      saveLine: vi.fn(async () => {
        callOrder.push("line");
      }),
      saveComputedTotal: vi.fn(async () => {
        callOrder.push("totals");
      }),
    });

    controller.scheduleConfigSave();
    snapshot.lines[0].quantity = 9;
    controller.scheduleLineSave("line-1");

    await vi.advanceTimersByTimeAsync(50);
    await controller.flushNow();

    expect(callOrder).toEqual(["line", "config"]);
  });

  it("persists both line and config edits when line changes first", async () => {
    const saveConfig = vi.fn(async () => undefined);
    const saveLine = vi.fn(async () => undefined);
    const saveComputedTotal = vi.fn(async () => undefined);
    const snapshot = {
      config: { id: "cfg-1", num_projects: 2 },
      lines: [{ id: "line-1", quantity: 3 }],
    };

    const controller = createMigrationPersistenceController({
      debounceMs: 50,
      getSnapshot: () => snapshot,
      saveConfig,
      saveLine,
      saveComputedTotal,
    });

    controller.scheduleLineSave("line-1");
    snapshot.config.num_projects = 4;
    controller.scheduleConfigSave();

    await vi.advanceTimersByTimeAsync(50);
    await controller.flushNow();

    expect(saveLine).toHaveBeenCalledTimes(1);
    expect(saveLine).toHaveBeenCalledWith({ id: "line-1", quantity: 3 });
    expect(saveConfig).toHaveBeenCalledTimes(1);
    expect(saveConfig).toHaveBeenCalledWith(
      { id: "cfg-1", num_projects: 4 },
      [{ id: "line-1", quantity: 3 }]
    );
    expect(saveComputedTotal).not.toHaveBeenCalled();
  });

  it("recomputes totals after line-only changes", async () => {
    const saveComputedTotal = vi.fn(async () => undefined);
    const controller = createMigrationPersistenceController({
      debounceMs: 50,
      getSnapshot: () => ({
        config: { id: "cfg-1", num_projects: 2 },
        lines: [{ id: "line-1", quantity: 7 }],
      }),
      saveConfig: vi.fn(async () => undefined),
      saveLine: vi.fn(async () => undefined),
      saveComputedTotal,
    });

    controller.scheduleLineSave("line-1");

    await vi.advanceTimersByTimeAsync(50);
    await controller.flushNow();

    expect(saveComputedTotal).toHaveBeenCalledTimes(1);
    expect(saveComputedTotal).toHaveBeenCalledWith(
      { id: "cfg-1", num_projects: 2 },
      [{ id: "line-1", quantity: 7 }]
    );
  });

  it("recomputes totals after add or remove changes", async () => {
    const saveComputedTotal = vi.fn(async () => undefined);
    const snapshot = {
      config: { id: "cfg-1", num_projects: 2 },
      lines: [{ id: "line-1", quantity: 4 }],
    };

    const controller = createMigrationPersistenceController({
      debounceMs: 50,
      getSnapshot: () => snapshot,
      saveConfig: vi.fn(async () => undefined),
      saveLine: vi.fn(async () => undefined),
      saveComputedTotal,
    });

    snapshot.lines = [];
    controller.scheduleTotalsRecompute();

    await vi.advanceTimersByTimeAsync(50);
    await controller.flushNow();

    expect(saveComputedTotal).toHaveBeenCalledTimes(1);
    expect(saveComputedTotal).toHaveBeenCalledWith(
      { id: "cfg-1", num_projects: 2 },
      []
    );
  });

  it("reports save status transitions for a successful run", async () => {
    const statuses: string[] = [];
    const controller = createMigrationPersistenceController({
      debounceMs: 50,
      getSnapshot: () => ({
        config: { id: "cfg-1", num_projects: 2 },
        lines: [{ id: "line-1", quantity: 7 }],
      }),
      saveConfig: vi.fn(async () => undefined),
      saveLine: vi.fn(async () => undefined),
      saveComputedTotal: vi.fn(async () => undefined),
      onStatusChange: (status) => {
        statuses.push(status);
      },
    });

    controller.scheduleLineSave("line-1");

    await vi.advanceTimersByTimeAsync(50);
    await controller.flushNow();

    expect(statuses).toContain("saving");
    expect(statuses).toContain("saved");
  });

  it("does not emit save status transitions when nothing is pending", async () => {
    const statuses: string[] = [];
    const controller = createMigrationPersistenceController({
      debounceMs: 50,
      getSnapshot: () => ({
        config: { id: "cfg-1", num_projects: 2 },
        lines: [{ id: "line-1", quantity: 7 }],
      }),
      saveConfig: vi.fn(async () => undefined),
      saveLine: vi.fn(async () => undefined),
      saveComputedTotal: vi.fn(async () => undefined),
      onStatusChange: (status) => {
        statuses.push(status);
      },
    });

    await controller.flushNow();

    expect(statuses).toEqual([]);
  });

  it("surfaces errors and keeps failed work retryable", async () => {
    const statuses: string[] = [];
    const errors: string[] = [];
    let shouldFail = true;

    const saveLine = vi.fn(async () => {
      if (shouldFail) {
        throw new Error("save line failed");
      }
    });

    const controller = createMigrationPersistenceController({
      debounceMs: 50,
      getSnapshot: () => ({
        config: { id: "cfg-1", num_projects: 2 },
        lines: [{ id: "line-1", quantity: 7 }],
      }),
      saveConfig: vi.fn(async () => undefined),
      saveLine,
      saveComputedTotal: vi.fn(async () => undefined),
      onStatusChange: (status) => {
        statuses.push(status);
      },
      onError: (error) => {
        errors.push(error instanceof Error ? error.message : String(error));
      },
    });

    controller.scheduleLineSave("line-1");

    await vi.advanceTimersByTimeAsync(50);
    await controller.flushNow();

    shouldFail = false;
    await controller.flushNow();

    expect(errors).toContain("save line failed");
    expect(statuses).toContain("error");
    expect(statuses.at(-1)).toBe("saved");
    expect(saveLine.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
