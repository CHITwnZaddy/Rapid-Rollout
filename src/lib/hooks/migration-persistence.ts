type TimerHandle = ReturnType<typeof setTimeout>;

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

  const clearTimer = () => {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  const hasPendingWork = () =>
    configDirty || totalsDirty || lineIdsDirty.size > 0;

  const runPending = async () => {
    const lineIds = [...lineIdsDirty];
    const shouldSaveConfig = configDirty;
    const shouldRecomputeTotals = totalsDirty;

    configDirty = false;
    totalsDirty = false;
    lineIdsDirty = new Set<string>();

    if (!shouldSaveConfig && !shouldRecomputeTotals && lineIds.length === 0) {
      return;
    }

    const snapshot = options.getSnapshot();
    if (!snapshot.config) {
      return;
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
        return;
      }

      if (shouldRecomputeTotals || linesToSave.length > 0) {
        await options.saveComputedTotal(snapshot.config, snapshot.lines);
      }
    } catch (error) {
      configDirty = configDirty || shouldSaveConfig;
      totalsDirty = totalsDirty || shouldRecomputeTotals || lineIds.length > 0;
      lineIdsDirty = new Set([...lineIdsDirty, ...lineIds]);
      throw error;
    }
  };

  const enqueueRun = () => {
    if (!hasPendingWork()) {
      return saveQueue;
    }

    options.onStatusChange?.("saving");
    saveQueue = saveQueue
      .then(async () => {
        await runPending();
        options.onStatusChange?.("saved");
        return true;
      })
      .catch((error) => {
        options.onStatusChange?.("error");
        options.onError?.(error);
        return false;
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
