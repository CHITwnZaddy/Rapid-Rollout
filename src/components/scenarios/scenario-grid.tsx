"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  buildServiceHoursMap,
  buildRateCardMap,
  calculateScenarioLine,
  calculateScenarioTotals,
  formatCurrency,
  formatHours,
  type ServiceHoursRow,
  type RateCardRow,
  type ScenarioLineOutput,
} from "@/lib/calculations/engine";
import { applyComplexity } from "@/lib/calculations/complexity";
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

interface ScenarioLineRow {
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
}

interface ScenarioGridProps {
  scenarioId: string;
  scenarioType: string;
  initialLines: ScenarioLineRow[];
  serviceHours: ServiceHoursRow[];
  rateCards: RateCardRow[];
  complexityFactor?: number;
}

export function ScenarioGrid({
  scenarioId,
  scenarioType,
  initialLines,
  serviceHours,
  rateCards,
  complexityFactor = 1,
}: ScenarioGridProps) {
  const supabase = createClient();
  const serviceHoursMap = useMemo(
    () => buildServiceHoursMap(serviceHours),
    [serviceHours]
  );
  const rateCardMap = useMemo(() => buildRateCardMap(rateCards), [rateCards]);

  // Get available scope options per module.
  // Sort tiers within a module: prompt rows ("Select # of..." / "Click here...") first,
  // then numeric values in numeric order (avoids lex "1,10,11,...,2,20"),
  // then alphabetical, with "Included with no..." pinned last.
  const scopeOptionsByModule = useMemo(() => {
    const scopeTier = (label: string): number => {
      const v = label.trim();
      if (/^Select /i.test(v) || /^Click here/i.test(v)) return 0;
      if (/^\d+$/.test(v)) return 1;
      if (/^Included with no/i.test(v)) return 3;
      return 2;
    };

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
    for (const opts of map.values()) {
      opts.sort((a, b) => {
        const ta = scopeTier(a.label);
        const tb = scopeTier(b.label);
        if (ta !== tb) return ta - tb;
        if (ta === 1) return Number(a.label) - Number(b.label);
        return a.label.localeCompare(b.label);
      });
    }
    return map;
  }, [serviceHours]);

  // Calculate initial outputs from stored data
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

  const [lines, setLines] = useState(initialOutputs);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">(
    "saved"
  );
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dirtyLinesRef = useRef<Set<string>>(new Set());
  const linesRef = useRef(initialOutputs);

  // Keep linesRef in sync with state
  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);

  const totals = useMemo(() => calculateScenarioTotals(lines), [lines]);

  const doSave = useCallback(async () => {
    const dirtyIds = Array.from(dirtyLinesRef.current);
    if (dirtyIds.length === 0) return;

    setSaveStatus("saving");
    dirtyLinesRef.current.clear();

    const currentLines = linesRef.current.filter((l) =>
      dirtyIds.includes(l.id)
    );

    // Phase 2.3 — replace N sequential UPDATE calls with a single
    // upsert keyed on id. Editing 10 lines used to fire 10 serial
    // PATCH requests; now it's one HTTP round trip. scenario_id,
    // row_order and module are NOT NULL on the table, so they must
    // be present in the upsert payload even though they don't
    // change — the row already exists and will be matched by id.
    if (currentLines.length > 0) {
      const payload = currentLines.map((line) => ({
        id: line.id,
        scenario_id: scenarioId,
        row_order: line.rowOrder,
        module: line.module,
        scope_selection: line.scopeSelection,
        sr_im_hours: line.srImHours,
        sr_im_cost: line.srImCost,
        pm_hours: line.pmHours,
        pm_cost: line.pmCost,
        ba_hours: line.baHours,
        ba_cost: line.baCost,
        total_hours: line.totalHours,
        total_cost: line.totalCost,
      }));
      await supabase
        .from("scenario_lines")
        .upsert(payload, { onConflict: "id" });
    }

    // Update scenario totals — fire this in parallel with the line
    // upsert above would require a Promise.all, but since the
    // totals need a fresh read of linesRef they're dependent on the
    // state being stable. Run it immediately after; on HTTP/2 to
    // Supabase the two calls multiplex so latency is ~1 round trip.
    const allTotals = calculateScenarioTotals(linesRef.current);
    await supabase
      .from("scenarios")
      .update({
        summary_total_hours: allTotals.totalHours,
        summary_total_cost: allTotals.totalCost,
      })
      .eq("id", scenarioId);

    setSaveStatus("saved");
  }, [scenarioId, supabase]);

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

      // Debounced save
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => doSave(), 800);
    },
    [serviceHoursMap, rateCardMap, doSave]
  );

  // Save immediately on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (dirtyLinesRef.current.size > 0) {
        doSave();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          Scenario {scenarioType}
        </h2>
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
              : "Unsaved changes"}
        </Badge>
      </div>

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
                Total Cost
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line) => {
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
                    {line.totalHours > 0
                      ? formatHours(applyComplexity(line.totalHours, complexityFactor))
                      : "-"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">
                    {line.totalCost > 0
                      ? formatCurrency(applyComplexity(line.totalCost, complexityFactor))
                      : "-"}
                  </TableCell>
                </TableRow>
              );
            })}
            {/* Totals row */}
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
                {formatHours(applyComplexity(totals.totalHours, complexityFactor))}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCurrency(applyComplexity(totals.totalCost, complexityFactor))}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
