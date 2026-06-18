"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  applyScenarioComplexityToLine,
  buildServiceHoursMap,
  buildRateCardMap,
  calculateScenarioLine,
  calculateScenarioContingencySummary,
  calculateScenarioTotals,
  formatCurrency,
  formatHours,
  type ServiceHoursRow,
  type RateCardRow,
} from "@/lib/calculations/engine";
import { ContingencySummaryTable } from "@/components/pricing/contingency-summary-table";
import { saveScenarioGridSelections } from "@/app/(app)/proposals/[id]/actions";
import { type ScenarioGridPersistLine } from "@/lib/scenarios/persist-scenario-grid";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ClearTabButton } from "@/components/proposals/clear-tab-button";
import { sortScopeOptions } from "@/lib/ui/scope-option-sort";
import { Button } from "@/components/ui/button";

type ScenarioLineRow = {
  id: string;
  scenario_id: string;
  row_order: number;
  module: string;
  scope_selection: string | null;
  sr_im_hours: number;
  sr_im_cost: number;
  pm_hours: number;
  pm_cost: number;
  ba_hours: number;
  ba_cost: number;
  total_hours: number;
  total_cost: number;
  is_locked: boolean;
};

type ScenarioGridLine = ScenarioGridPersistLine & {
  scopeLabel: string;
};

type ScenarioGridProps = {
  proposalId: string;
  scenarioId: string;
  scenarioType: string;
  initialLines: ScenarioLineRow[];
  serviceHours: ServiceHoursRow[];
  rateCards: RateCardRow[];
  complexityFactor?: number;
  internalCostRate?: number;
};

export function ScenarioGrid({
  proposalId,
  scenarioId,
  scenarioType,
  initialLines,
  serviceHours,
  rateCards,
  complexityFactor = 1,
  internalCostRate = 0,
}: ScenarioGridProps) {
  const serviceHoursMap = useMemo(
    () => buildServiceHoursMap(serviceHours),
    [serviceHours]
  );
  const rateCardMap = useMemo(() => buildRateCardMap(rateCards), [rateCards]);

  // Scope options per module, sorted via the shared helper so the
  // same tier rules (prompt first, numeric ordered, then alpha, then
  // "Included with no..." last) are testable in isolation.
  const scopeOptionsByModule = useMemo(() => {
    const map = new Map<string, { value: string; label: string }[]>();
    for (const sh of serviceHours) {
      if (!map.has(sh.service_name)) {
        map.set(sh.service_name, []);
      }
      map.get(sh.service_name)!.push({
        value: sh.scope_value,
        label: sh.scope_value,
      });
    }
    for (const [key, opts] of map) {
      map.set(key, sortScopeOptions(opts));
    }
    return map;
  }, [serviceHours]);

  const initialOutputs = useMemo(
    () =>
      initialLines.map((line) => {
        const calc = calculateScenarioLine(
          { module: line.module, scopeSelection: line.scope_selection },
          serviceHoursMap,
          rateCardMap
        );
        return { ...calc, id: line.id, rowOrder: line.row_order };
      }),
    [initialLines, serviceHoursMap, rateCardMap]
  );

  const [lines, setLines] = useState<ScenarioGridLine[]>(initialOutputs);
  const [saveStatus, setSaveStatus] = useState<
    "saved" | "saving" | "unsaved" | "error"
  >("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dirtyLinesRef = useRef<Set<string>>(new Set());
  const linesRef = useRef<ScenarioGridLine[]>(initialOutputs);
  const isSavingRef = useRef(false);
  const doSaveRef = useRef<() => Promise<void>>(async () => {});

  const scheduleSave = useCallback((delayMs = 800) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void doSaveRef.current();
    }, delayMs);
  }, []);

  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);

  const displayLines = useMemo<ScenarioGridLine[]>(
    () => lines.map((line) => applyScenarioComplexityToLine(line, complexityFactor)),
    [lines, complexityFactor]
  );

  const baseTotals = useMemo(
    () => calculateScenarioTotals(lines),
    [lines]
  );

  const totals = useMemo(
    () => calculateScenarioTotals(displayLines),
    [displayLines]
  );

  const contingencySummary = useMemo(
    () =>
      calculateScenarioContingencySummary(
        baseTotals,
        complexityFactor,
        internalCostRate
      ),
    [baseTotals, complexityFactor, internalCostRate]
  );
  const blendedRate =
    contingencySummary.totalClientHours === 0
      ? 0
      : contingencySummary.clientPrice / contingencySummary.totalClientHours;

  const doSave = useCallback(async () => {
    if (isSavingRef.current) {
      return;
    }

    const dirtyIds = Array.from(dirtyLinesRef.current);
    if (dirtyIds.length === 0) return;

    isSavingRef.current = true;
    setSaveStatus("saving");
    setSaveError(null);
    dirtyLinesRef.current.clear();

    try {
      const dirtyLines = linesRef.current.filter((line) =>
        dirtyIds.includes(line.id)
      );

      const result = await saveScenarioGridSelections(
        proposalId,
        scenarioId,
        dirtyLines.map((line) => ({
          lineId: line.id,
          scopeSelection: line.scopeSelection,
        }))
      );

      if (!result.ok) {
        throw new Error(result.error);
      }

      const canonicalLines = new Map(
        result.lines.map((line) => [
          line.id,
          {
            ...line,
            scopeLabel: "",
          },
        ])
      );

      setLines((prev) =>
        prev.map((line) =>
          dirtyLinesRef.current.has(line.id)
            ? line
            : (canonicalLines.get(line.id) ?? line)
        )
      );

      if (dirtyLinesRef.current.size > 0) {
        setSaveStatus("unsaved");
        scheduleSave(0);
      } else {
        setSaveStatus("saved");
      }
    } catch (error) {
      for (const dirtyId of dirtyIds) {
        dirtyLinesRef.current.add(dirtyId);
      }
      setSaveStatus("error");
      setSaveError(
        error instanceof Error
          ? error.message
          : "Couldn't save scenario changes."
      );
    } finally {
      isSavingRef.current = false;
    }
  }, [proposalId, scenarioId, scheduleSave]);

  const handleScopeChange = useCallback(
    (lineId: string, module: string, newScope: string) => {
      const calc = calculateScenarioLine(
        { module, scopeSelection: newScope === "__none__" ? null : newScope },
        serviceHoursMap,
        rateCardMap
      );

      setLines((prev) =>
        prev.map((l) =>
          l.id === lineId
            ? {
                ...l,
                ...calc,
                scopeSelection:
                  newScope === "__none__" ? null : newScope,
              }
            : l
        )
      );

      dirtyLinesRef.current.add(lineId);
      setSaveStatus("unsaved");
      setSaveError(null);

      scheduleSave();
    },
    [serviceHoursMap, rateCardMap, scheduleSave]
  );

  useEffect(() => {
    doSaveRef.current = doSave;
  }, [doSave]);

  // Clear Tab: reset every line's scope selection to none and push the
  // change through the normal save pipeline (mark all dirty, save now).
  const handleClearAll = useCallback(() => {
    setLines((prev) =>
      prev.map((line) => {
        const calc = calculateScenarioLine(
          { module: line.module, scopeSelection: null },
          serviceHoursMap,
          rateCardMap
        );
        return { ...line, ...calc, scopeSelection: null };
      })
    );
    for (const line of linesRef.current) {
      dirtyLinesRef.current.add(line.id);
    }
    setSaveStatus("unsaved");
    setSaveError(null);
    scheduleSave(0);
  }, [serviceHoursMap, rateCardMap, scheduleSave]);

  const hasAnySelection = lines.some((line) => line.scopeSelection !== null);

  useEffect(() => {
    const dirtyLines = dirtyLinesRef.current;

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (dirtyLines.size > 0) {
        void doSaveRef.current();
      }
    };
  }, []);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          Scenario {scenarioType}
        </h2>
        <div className="flex items-center gap-2">
        <ClearTabButton
          description="All scope selections on this tab will be reset, zeroing its hours and costs."
          onConfirm={handleClearAll}
          disabled={!hasAnySelection || saveStatus === "saving"}
        />
        <Badge
          variant={
            saveStatus === "saved"
              ? "secondary"
              : saveStatus === "saving"
                ? "default"
                : "destructive"
          }
        >
          {saveStatus === "saved"
            ? "All changes saved"
            : saveStatus === "saving"
              ? "Saving..."
              : saveStatus === "error"
                ? "Save failed"
                : "Unsaved changes"}
        </Badge>
        </div>
      </div>

      {(saveStatus === "error" || saveError) && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <span>
            {saveError ??
              "Scenario changes could not be saved. Please retry the save."}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setSaveError(null);
              setSaveStatus("unsaved");
              scheduleSave(0);
            }}
          >
            Retry Save
          </Button>
        </div>
      )}

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[200px]">Module</TableHead>
              <TableHead className="w-[200px]">Scope</TableHead>
              <TableHead className="text-right">Sr. IM Hrs</TableHead>
              <TableHead className="text-right">Sr. IM Cost</TableHead>
              <TableHead className="text-right">PM Hrs</TableHead>
              <TableHead className="text-right">PM Cost</TableHead>
              <TableHead className="text-right">BA Hrs</TableHead>
              <TableHead className="text-right">BA Cost</TableHead>
              <TableHead className="text-right">Total Hrs</TableHead>
              <TableHead className="text-right font-semibold">
                Client Price
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayLines.map((line) => {
              const options = scopeOptionsByModule.get(line.module) ?? [];
              return (
                <TableRow key={line.id}>
                  <TableCell className="font-medium">{line.module}</TableCell>
                  <TableCell>
                    <Select
                      value={line.scopeSelection ?? "__none__"}
                      onValueChange={(val) =>
                        handleScopeChange(line.id, line.module, val ?? "__none__")
                      }
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue>
                          {line.scopeSelection
                            ? (options.find((o) => o.value === line.scopeSelection)?.label ?? line.scopeSelection)
                            : (options[0]?.label ?? "")}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {options.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {line.srImHours > 0 ? formatHours(line.srImHours) : "-"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {line.srImCost > 0 ? formatCurrency(line.srImCost) : "-"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {line.pmHours > 0 ? formatHours(line.pmHours) : "-"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {line.pmCost > 0 ? formatCurrency(line.pmCost) : "-"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {line.baHours > 0 ? formatHours(line.baHours) : "-"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {line.baCost > 0 ? formatCurrency(line.baCost) : "-"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {line.totalHours > 0 ? formatHours(line.totalHours) : "-"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">
                    {line.totalCost > 0 ? formatCurrency(line.totalCost) : "-"}
                  </TableCell>
                </TableRow>
              );
            })}
            <TableRow className="bg-muted/50 font-semibold">
              <TableCell colSpan={2}>Totals</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatHours(totals.totalSrImHours)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCurrency(totals.totalSrImCost)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatHours(totals.totalPmHours)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCurrency(totals.totalPmCost)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatHours(totals.totalBaHours)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCurrency(totals.totalBaCost)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatHours(totals.totalHours)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCurrency(totals.totalCost)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
      <div className="mt-4">
        <ContingencySummaryTable
          rows={contingencySummary.roleBreakouts}
          clientPrice={contingencySummary.clientPrice}
          blendedRate={blendedRate}
          marginPercent={contingencySummary.marginPercent}
        />
      </div>
    </div>
  );
}
