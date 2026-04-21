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
};

export type MigrationPersistenceController = {
  scheduleConfigSave: () => void;
  scheduleLineSave: (lineId: string) => void;
  scheduleTotalsRecompute: () => void;
  flushNow: () => Promise<void>;
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
  let saveQueue = Promise.resolve();

  const clearTimer = () => {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

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
  };

  const enqueueRun = () => {
    saveQueue = saveQueue
      .then(runPending)
      .catch(() => undefined);
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
      await enqueueRun();
    },
    dispose() {
      clearTimer();
    },
  };
}
