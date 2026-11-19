import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PROPOSAL_EDIT_NOT_PERMITTED } from "@/lib/supabase/affected-rows";
import {
  assertMigrationWriteSaved,
  createMigrationPersistenceController,
  MigrationSaveRefusedError,
} from "./migration-persistence";

describe("assertMigrationWriteSaved", () => {
  it("accepts a write that changed a row", () => {
    expect(() =>
      assertMigrationWriteSaved({ error: null, count: 1 }, "Couldn't save.")
    ).not.toThrow();
  });

  it("throws the not-permitted refusal when RLS let the write through with zero rows", () => {
    let thrown: unknown;
    try {
      assertMigrationWriteSaved({ error: null, count: 0 }, "Couldn't save.");
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(MigrationSaveRefusedError);
    expect((thrown as Error).message).toBe(PROPOSAL_EDIT_NOT_PERMITTED);
  });

  it("treats a missing count (no { count: \"exact\" }) as a refusal, not a save", () => {
    expect(() =>
      assertMigrationWriteSaved({ error: null, count: null }, "Couldn't save.")
    ).toThrow(MigrationSaveRefusedError);
  });

  it("keeps the caller's prefix and stays retryable for a Supabase error", () => {
    let thrown: unknown;
    try {
      assertMigrationWriteSaved(
        { error: { message: "network down" }, count: null },
        "Couldn't save migration detail row."
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect(thrown).not.toBeInstanceOf(MigrationSaveRefusedError);
    expect((thrown as Error).message).toBe(
      "Couldn't save migration detail row. network down"
    );
  });
});

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

  it("reports a zero-row (RLS-refused) write as an error instead of saved", async () => {
    const statuses: string[] = [];
    const errors: string[] = [];
    const saveComputedTotal = vi.fn(async () => undefined);

    const controller = createMigrationPersistenceController({
      debounceMs: 50,
      getSnapshot: () => ({
        config: { id: "cfg-1", num_projects: 2 },
        lines: [{ id: "line-1", quantity: 7 }],
      }),
      saveConfig: vi.fn(async () => undefined),
      // What the hook's saveLine does with Supabase's reply for a non-owner.
      saveLine: vi.fn(async () => {
        assertMigrationWriteSaved(
          { error: null, count: 0 },
          "Couldn't save migration detail row."
        );
      }),
      saveComputedTotal,
      onStatusChange: (status) => {
        statuses.push(status);
      },
      onError: (error) => {
        errors.push(error instanceof Error ? error.message : String(error));
      },
    });

    controller.scheduleLineSave("line-1");
    await vi.advanceTimersByTimeAsync(50);

    expect(statuses).toEqual(["saving", "error"]);
    expect(errors).toEqual([PROPOSAL_EDIT_NOT_PERMITTED]);
    expect(saveComputedTotal).not.toHaveBeenCalled();
  });

  it("drops a refused save instead of resending it on retry or later edits", async () => {
    const statuses: string[] = [];
    const saveLine = vi.fn(async () => {
      throw new MigrationSaveRefusedError();
    });
    const saveConfig = vi.fn(async () => undefined);

    const controller = createMigrationPersistenceController({
      debounceMs: 50,
      getSnapshot: () => ({
        config: { id: "cfg-1", num_projects: 2 },
        lines: [{ id: "line-1", quantity: 7 }],
      }),
      saveConfig,
      saveLine,
      saveComputedTotal: vi.fn(async () => undefined),
      onStatusChange: (status) => {
        statuses.push(status);
      },
    });

    controller.scheduleLineSave("line-1");
    await expect(controller.flushNow()).resolves.toBe(false);

    // Retry Save / a row add-remove flush: nothing outstanding, so it neither
    // resends the refused row nor stays stuck on the refused run's failure.
    await expect(controller.flushNow()).resolves.toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(saveLine).toHaveBeenCalledTimes(1);
    expect(statuses).toEqual(["saving", "error"]);

    // A later edit saves only itself.
    controller.scheduleConfigSave();
    await expect(controller.flushNow()).resolves.toBe(true);
    expect(saveLine).toHaveBeenCalledTimes(1);
    expect(saveConfig).toHaveBeenCalledTimes(1);
    expect(statuses.at(-1)).toBe("saved");
  });

  it("still reports failure to a flush that waits on a refused run in flight", async () => {
    let refuse: (() => void) | undefined;
    const saveLine = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          refuse = () => reject(new MigrationSaveRefusedError());
        })
    );

    const controller = createMigrationPersistenceController({
      debounceMs: 50,
      getSnapshot: () => ({
        config: { id: "cfg-1", num_projects: 2 },
        lines: [{ id: "line-1", quantity: 7 }],
      }),
      saveConfig: vi.fn(async () => undefined),
      saveLine,
      saveComputedTotal: vi.fn(async () => undefined),
    });

    controller.scheduleLineSave("line-1");
    const first = controller.flushNow();
    await vi.advanceTimersByTimeAsync(0);
    // Nothing new is pending, so this waits on the in-flight run.
    const waiting = controller.flushNow();
    refuse?.();

    await expect(first).resolves.toBe(false);
    await expect(waiting).resolves.toBe(false);
  });

  it("does not report \"saved\" for a queued edit that a refusal dropped", async () => {
    const statuses: string[] = [];
    let refuse: (() => void) | undefined;
    const saveLine = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          refuse = () => reject(new MigrationSaveRefusedError());
        })
    );
    const saveConfig = vi.fn(async () => undefined);

    const controller = createMigrationPersistenceController({
      debounceMs: 50,
      getSnapshot: () => ({
        config: { id: "cfg-1", num_projects: 2 },
        lines: [{ id: "line-1", quantity: 7 }],
      }),
      saveConfig,
      saveLine,
      saveComputedTotal: vi.fn(async () => undefined),
      onStatusChange: (status) => {
        statuses.push(status);
      },
    });

    // Edit A is in flight; edit B queues a second run behind it.
    controller.scheduleLineSave("line-1");
    const first = controller.flushNow();
    await vi.advanceTimersByTimeAsync(0);
    controller.scheduleConfigSave();
    const queued = controller.flushNow();

    // A is refused, which drops B before its run starts.
    refuse?.();

    await expect(first).resolves.toBe(false);
    await expect(queued).resolves.toBe(false);
    expect(saveConfig).not.toHaveBeenCalled();
    expect(statuses).toEqual(["saving", "saving", "error"]);

    // The next real edit saves and reports "saved" again.
    controller.scheduleConfigSave();
    await expect(controller.flushNow()).resolves.toBe(true);
    expect(saveConfig).toHaveBeenCalledTimes(1);
    expect(statuses.at(-1)).toBe("saved");
  });
});
