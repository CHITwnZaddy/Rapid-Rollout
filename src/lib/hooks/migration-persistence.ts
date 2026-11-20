import {
  checkAffectedRows,
  PROPOSAL_CHANGE_NOT_SAVED,
} from "@/lib/supabase/affected-rows";

type TimerHandle = ReturnType<typeof setTimeout>;

/**
 * A migration write was refused: Supabase reported no error but zero affected
 * rows. Any signed-in user may edit a proposal's migration tab, so this means
 * the row (or its proposal) is gone, e.g. deleted in another tab, or the
 * session ended. Resending the same write cannot succeed, so the controller
 * drops the pending work instead of re-queuing it, and the caller restores
 * the stored values.
 */
export class MigrationSaveRefusedError extends Error {
  constructor(message: string = PROPOSAL_CHANGE_NOT_SAVED) {
    super(message);
    this.name = "MigrationSaveRefusedError";
  }
}

/**
 * Check a migration_config / migration_detail_lines write made with
 * { count: "exact" }. A Supabase error keeps the caller's "Couldn't ..."
 * prefix and stays retryable; zero (or missing) affected rows throws
 * MigrationSaveRefusedError.
 */
export function assertMigrationWriteSaved(
  result: { error: { message: string } | null; count: number | null },
  failurePrefix: string
): void {
  if (result.error) {
    throw new Error(`${failurePrefix} ${result.error.message}`);
  }
  const written = checkAffectedRows(result, PROPOSAL_CHANGE_NOT_SAVED);
  if (!written.ok) {
    throw new MigrationSaveRefusedError(written.error);
  }
}

type DbConfigLike = {
  id: string;
};

type DbLineLike = {
  id: string;
};

type MigrationSnapshot<TConfig extends DbConfigLike, TLine extends DbLineLike> = {
  config: TConfig | null;
  lines: TLine[];
};

type CreateMigrationPersistenceControllerOptions<
  TConfig extends DbConfigLike,
  TLine extends DbLineLike,
> = {
  debounceMs?: number;
  getSnapshot: () => MigrationSnapshot<TConfig, TLine>;
  saveConfig: (config: TConfig, lines: TLine[]) => Promise<void>;
  saveLine: (line: TLine) => Promise<void>;
  saveComputedTotal: (config: TConfig, lines: TLine[]) => Promise<void>;
  onStatusChange?: (status: "idle" | "saving" | "saved" | "error") => void;
  onError?: (error: unknown) => void;
};

export type MigrationPersistenceController = {
  scheduleConfigSave: () => void;
  scheduleLineSave: (lineId: string) => void;
  scheduleTotalsRecompute: () => void;
  flushNow: () => Promise<boolean>;
  dispose: () => void;
};

export function createMigrationPersistenceController<
  TConfig extends DbConfigLike,
  TLine extends DbLineLike,
>(
  options: CreateMigrationPersistenceControllerOptions<TConfig, TLine>
): MigrationPersistenceController {
  const debounceMs = options.debounceMs ?? 800;

  let timer: TimerHandle | undefined;
  let configDirty = false;
  let totalsDirty = false;
  let lineIdsDirty = new Set<string>();
  let saveQueue = Promise.resolve(true);
  let runsInFlight = 0;
  // Bumped each time a refusal drops pending work. A run queued before the
  // drop then finds nothing to do; it must not report "saved" for edits that
  // were thrown away.
  let refusalEpoch = 0;

  const clearTimer = () => {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  const hasPendingWork = () =>
    configDirty || totalsDirty || lineIdsDirty.size > 0;

  // Resolves true when it attempted a save, false when there was nothing to do.
  const runPending = async (): Promise<boolean> => {
    const lineIds = [...lineIdsDirty];
    const shouldSaveConfig = configDirty;
    const shouldRecomputeTotals = totalsDirty;

    configDirty = false;
    totalsDirty = false;
    lineIdsDirty = new Set<string>();

    if (!shouldSaveConfig && !shouldRecomputeTotals && lineIds.length === 0) {
      return false;
    }

    const snapshot = options.getSnapshot();
    if (!snapshot.config) {
      return false;
    }

    try {
      const linesToSave = lineIds
        .map((lineId) => snapshot.lines.find((line) => line.id === lineId))
        .filter((line): line is TLine => Boolean(line));

      if (linesToSave.length > 0) {
        await Promise.all(linesToSave.map((line) => options.saveLine(line)));
      }

      if (shouldSaveConfig) {
        await options.saveConfig(snapshot.config, snapshot.lines);
        return true;
      }

      if (shouldRecomputeTotals || linesToSave.length > 0) {
        await options.saveComputedTotal(snapshot.config, snapshot.lines);
      }
      return true;
    } catch (error) {
      if (error instanceof MigrationSaveRefusedError) {
        // Retrying a refused write cannot succeed. Drop everything pending
        // (the caller puts the stored values back on screen) so later edits,
        // Retry Save and the unmount flush do not resend it.
        clearTimer();
        configDirty = false;
        totalsDirty = false;
        lineIdsDirty = new Set<string>();
        refusalEpoch += 1;
        throw error;
      }
      configDirty = configDirty || shouldSaveConfig;
      totalsDirty = totalsDirty || shouldRecomputeTotals || lineIds.length > 0;
      lineIdsDirty = new Set([...lineIdsDirty, ...lineIds]);
      throw error;
    }
  };

  const enqueueRun = () => {
    if (!hasPendingWork()) {
      // Wait for a run still in flight; otherwise nothing is outstanding. A
      // refused run drops its work, so its `false` must not stick to later
      // flushes (it would block every row add/remove after one refusal).
      return runsInFlight > 0 ? saveQueue : Promise.resolve(true);
    }

    runsInFlight += 1;
    options.onStatusChange?.("saving");
    const epochAtEnqueue = refusalEpoch;
    saveQueue = saveQueue
      .then(async () => {
        const attempted = await runPending();
        if (!attempted && refusalEpoch !== epochAtEnqueue) {
          // A refusal earlier in the queue dropped this run's edits, so
          // nothing was saved. Leave the status at "error" from that run.
          return false;
        }
        options.onStatusChange?.("saved");
        return true;
      })
      .catch((error) => {
        options.onStatusChange?.("error");
        options.onError?.(error);
        return false;
      })
      .finally(() => {
        runsInFlight -= 1;
      });
    return saveQueue;
  };

  const schedule = () => {
    clearTimer();
    timer = setTimeout(() => {
      void enqueueRun();
    }, debounceMs);
  };

  return {
    scheduleConfigSave() {
      configDirty = true;
      schedule();
    },
    scheduleLineSave(lineId: string) {
      lineIdsDirty.add(lineId);
      totalsDirty = true;
      schedule();
    },
    scheduleTotalsRecompute() {
      totalsDirty = true;
      schedule();
    },
    async flushNow() {
      clearTimer();
      return enqueueRun();
    },
    dispose() {
      clearTimer();
    },
  };
}
