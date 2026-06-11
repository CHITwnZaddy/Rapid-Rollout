"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  buildRateCardMap,
  formatCurrency,
  formatHours,
  type RateCardRow,
} from "@/lib/calculations/engine";
import { applyComplexity } from "@/lib/calculations/complexity";
import {
  calculateRolePricingBreakouts,
  sumContingencyBreakouts,
  type RolePricingBreakout,
} from "@/lib/calculations/contingency-pricing";
import { ContingencySummaryTable } from "@/components/pricing/contingency-summary-table";
import { ScopedComplexityFactor } from "@/components/proposals/scoped-complexity-factor";
import { toast } from "sonner";
import { SCOPED_SERVICE_TYPES } from "@/lib/validation/scoped-services";
import {
  SCOPED_KEY_BA,
  INTERNAL_COST_RATE_KEY,
  SCOPED_KEY_PM,
  SCOPED_KEY_SR_IM,
} from "@/lib/rate-card-keys";
import {
  addScopedServiceLine,
  clearScopedServices,
  deleteScopedServiceLine,
  type ScopedServiceLine,
  updateScopedServiceLine,
} from "./actions";
import { ClearTabButton } from "@/components/proposals/clear-tab-button";

function sortScopedLines(lines: ScopedServiceLine[]): ScopedServiceLine[] {
  return [...lines].sort((a, b) => {
    if (a.row_order !== b.row_order) return a.row_order - b.row_order;
    return a.id.localeCompare(b.id);
  });
}

function recalculateScopedLine(
  line: ScopedServiceLine,
  rateCardMap: Map<string, number>
): ScopedServiceLine {
  const rate = rateCardMap.get(line.rate_card_lookup_key) ?? 0;
  return {
    ...line,
    cost: line.hours * rate,
  };
}

export default function ScopedServicesPage() {
  const { id: proposalId } = useParams<{ id: string }>();
  const supabase = createClient();

  const [lines, setLines] = useState<ScopedServiceLine[]>([]);
  const [rateCards, setRateCards] = useState<RateCardRow[]>([]);
  const [complexityFactor, setComplexityFactor] = useState<number>(1);
  const [isAdding, setIsAdding] = useState(false);
  const [savingLineId, setSavingLineId] = useState<string | null>(null);
  const [deletingLineId, setDeletingLineId] = useState<string | null>(null);
  const rateCardMap = useMemo(() => buildRateCardMap(rateCards), [rateCards]);
  const persistedLinesRef = useRef<ScopedServiceLine[]>([]);

  const syncServerLines = useCallback((nextLines: ScopedServiceLine[]) => {
    const sortedLines = sortScopedLines(nextLines);
    persistedLinesRef.current = sortedLines;
    setLines(sortedLines);
  }, []);

  useEffect(() => {
    const load = async () => {
      const [{ data: scopedData }, { data: rateData }, { data: proposalData }] =
        await Promise.all([
          supabase
            .from("scoped_services")
            .select(
              "id, service_type, description, hours, rate_card_lookup_key, cost, row_order"
            )
            .eq("proposal_id", proposalId)
            .order("row_order"),
          supabase.from("rate_cards").select("*").eq("status", "Active"),
          supabase
            .from("proposals")
            .select("scoped_complexity_factor")
            .eq("id", proposalId)
            .single(),
        ]);
      if (scopedData) syncServerLines(scopedData as ScopedServiceLine[]);
      if (rateData) setRateCards(rateData);
      if (proposalData) {
        setComplexityFactor(Number(proposalData.scoped_complexity_factor ?? 1));
      }
    };
    void load();
  }, [proposalId, supabase, syncServerLines]);

  const persistLine = useCallback(
    async (nextLine: ScopedServiceLine): Promise<boolean> => {
      setSavingLineId(nextLine.id);

      const result = await updateScopedServiceLine(proposalId, nextLine.id, {
        serviceType: nextLine.service_type,
        description: nextLine.description ?? "",
        hours: nextLine.hours,
        rateCardLookupKey: nextLine.rate_card_lookup_key,
      });

      setSavingLineId((current) => (current === nextLine.id ? null : current));

      if (!result.ok) {
        const persistedLine = persistedLinesRef.current.find(
          (line) => line.id === nextLine.id
        );
        if (persistedLine) {
          setLines((prev) =>
            prev.map((line) => (line.id === nextLine.id ? persistedLine : line))
          );
        }
        toast.error(`Couldn't save scoped service line. ${result.error}`);
        return false;
      }

      syncServerLines(result.lines);
      return true;
    },
    [proposalId, syncServerLines]
  );

  const addLine = useCallback(async () => {
    setIsAdding(true);
    const result = await addScopedServiceLine(proposalId);
    setIsAdding(false);

    if (!result.ok) {
      toast.error(`Couldn't add scoped service line. ${result.error}`);
      return;
    }

    syncServerLines(result.lines);
    toast.success("Scoped service line added.");
  }, [proposalId, syncServerLines]);

  const handleClearTab = useCallback(async () => {
    const result = await clearScopedServices(proposalId);
    if (!result.ok) {
      toast.error(`Couldn't clear scoped services. ${result.error}`);
      return;
    }
    syncServerLines(result.lines);
    toast.success("Scoped services cleared.");
  }, [proposalId, syncServerLines]);

  const saveLineOnBlur = useCallback(
    async (lineId: string) => {
      const nextLine = lines.find((line) => line.id === lineId);
      const persistedLine = persistedLinesRef.current.find(
        (line) => line.id === lineId
      );
      if (!nextLine || !persistedLine) return;

      if (
        nextLine.service_type === persistedLine.service_type &&
        (nextLine.description ?? "") === (persistedLine.description ?? "") &&
        nextLine.hours === persistedLine.hours &&
        nextLine.rate_card_lookup_key === persistedLine.rate_card_lookup_key
      ) {
        return;
      }

      await persistLine(nextLine);
    },
    [lines, persistLine]
  );

  const applyLocalLineChange = useCallback(
    (
      lineId: string,
      updater: (line: ScopedServiceLine) => ScopedServiceLine
    ): ScopedServiceLine | null => {
      let nextLine: ScopedServiceLine | null = null;

      setLines((prev) =>
        prev.map((line) => {
          if (line.id !== lineId) return line;
          nextLine = updater(line);
          return nextLine;
        })
      );

      return nextLine;
    },
    []
  );

  const updateLineImmediately = useCallback(
    async (
      lineId: string,
      updater: (line: ScopedServiceLine) => ScopedServiceLine
    ) => {
      const nextLine = applyLocalLineChange(lineId, updater);
      if (!nextLine) return;
      await persistLine(nextLine);
    },
    [applyLocalLineChange, persistLine]
  );

  const removeLine = useCallback(
    async (lineId: string) => {
      setDeletingLineId(lineId);
      const result = await deleteScopedServiceLine(proposalId, lineId);
      setDeletingLineId((current) => (current === lineId ? null : current));

      if (!result.ok) {
        toast.error(`Couldn't delete scoped service line. ${result.error}`);
        return;
      }

      syncServerLines(result.lines);
      toast.success("Scoped service line deleted.");
    },
    [proposalId, syncServerLines]
  );

  const isMutating = isAdding || !!savingLineId || !!deletingLineId;
  const rawTotalCost = lines.reduce((sum, line) => sum + (line.cost ?? 0), 0);
  const rawTotalHours = lines.reduce((sum, line) => sum + (line.hours ?? 0), 0);
  const totalCost = applyComplexity(rawTotalCost, complexityFactor);
  const totalHours = applyComplexity(rawTotalHours, complexityFactor);
  const internalCostRate = rateCardMap.get(INTERNAL_COST_RATE_KEY) ?? 0;
  const scopedRoleBreakouts: RolePricingBreakout[] = calculateRolePricingBreakouts(
    [
      {
        role: "srIm",
        label: "Sr. IM",
        baseHours: lines
          .filter((line) => line.rate_card_lookup_key === SCOPED_KEY_SR_IM)
          .reduce((sum, line) => sum + (line.hours ?? 0), 0),
        rate: rateCardMap.get(SCOPED_KEY_SR_IM) ?? 0,
      },
      {
        role: "pm",
        label: "PM",
        baseHours: lines
          .filter((line) => line.rate_card_lookup_key === SCOPED_KEY_PM)
          .reduce((sum, line) => sum + (line.hours ?? 0), 0),
        rate: rateCardMap.get(SCOPED_KEY_PM) ?? 0,
      },
      {
        role: "ba",
        label: "BA",
        baseHours: lines
          .filter((line) => line.rate_card_lookup_key === SCOPED_KEY_BA)
          .reduce((sum, line) => sum + (line.hours ?? 0), 0),
        rate: rateCardMap.get(SCOPED_KEY_BA) ?? 0,
      },
    ],
    complexityFactor,
    internalCostRate
  );
  const scopedSummary = sumContingencyBreakouts(scopedRoleBreakouts);
  const scopedBlendedRate =
    scopedSummary.totalClientHours === 0
      ? 0
      : scopedSummary.clientPrice / scopedSummary.totalClientHours;

  return (
    <div className="space-y-4">
      <div className="rounded-md border bg-card p-4">
        <ScopedComplexityFactor
          proposalId={proposalId}
          initialValue={complexityFactor}
          onChange={setComplexityFactor}
        />
      </div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Scoped Services</h2>
        <div className="flex items-center gap-2">
          <ClearTabButton
            description="All scoped service lines will be deleted."
            onConfirm={handleClearTab}
            disabled={isMutating || lines.length === 0}
          />
          <Button onClick={addLine} size="sm" disabled={isMutating}>
            {isAdding ? "Adding..." : "Add Line"}
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[220px]">Service Type</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-[100px] text-right">Raw Hours</TableHead>
              <TableHead className="w-[200px]">Rate Card</TableHead>
              <TableHead className="w-[120px] text-right">Adj Hours</TableHead>
              <TableHead className="w-[120px] text-right">Cost</TableHead>
              <TableHead className="w-[60px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line) => (
              <TableRow key={line.id}>
                <TableCell>
                  <Select
                    value={line.service_type}
                    disabled={isMutating}
                    onValueChange={(value) =>
                      void updateLineImmediately(line.id, (currentLine) =>
                        recalculateScopedLine(
                          { ...currentLine, service_type: String(value) },
                          rateCardMap
                        )
                      )
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SCOPED_SERVICE_TYPES.map((serviceType) => (
                        <SelectItem key={serviceType} value={serviceType}>
                          {serviceType}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Input
                    className="h-8 text-xs"
                    value={line.description ?? ""}
                    disabled={isMutating}
                    onChange={(event) =>
                      void applyLocalLineChange(line.id, (currentLine) => ({
                        ...currentLine,
                        description: event.target.value,
                      }))
                    }
                    onBlur={() => void saveLineOnBlur(line.id)}
                    placeholder="Description"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    className="h-8 text-right text-xs"
                    type="number"
                    min={0}
                    step={0.5}
                    value={line.hours}
                    disabled={isMutating}
                    onChange={(event) => {
                      const nextHours =
                        event.target.value === ""
                          ? 0
                          : Number(event.target.value);
                      if (Number.isNaN(nextHours)) return;
                      void applyLocalLineChange(line.id, (currentLine) =>
                        recalculateScopedLine(
                          { ...currentLine, hours: nextHours },
                          rateCardMap
                        )
                      );
                    }}
                    onBlur={() => void saveLineOnBlur(line.id)}
                  />
                </TableCell>
                <TableCell>
                  <Select
                    value={line.rate_card_lookup_key}
                    disabled={isMutating}
                    onValueChange={(value) =>
                      void updateLineImmediately(line.id, (currentLine) =>
                        recalculateScopedLine(
                          {
                            ...currentLine,
                            rate_card_lookup_key: String(value),
                          },
                          rateCardMap
                        )
                      )
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {rateCards.map((rateCard) => (
                        <SelectItem
                          key={rateCard.lookup_key}
                          value={rateCard.lookup_key}
                        >
                          {rateCard.activity} ({formatCurrency(rateCard.rate)}/hr)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-right tabular-nums text-sm">
                  {formatHours(applyComplexity(line.hours ?? 0, complexityFactor))}
                </TableCell>
                <TableCell className="text-right tabular-nums font-medium">
                  {formatCurrency(applyComplexity(line.cost ?? 0, complexityFactor))}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-destructive"
                    disabled={isMutating}
                    onClick={() => void removeLine(line.id)}
                  >
                    {deletingLineId === line.id ? "Removing..." : "Remove"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {lines.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-8 text-center text-muted-foreground"
                >
                  No scoped services. Click &quot;Add Line&quot; to start.
                </TableCell>
              </TableRow>
            )}
            <TableRow className="bg-muted/50 font-semibold">
              <TableCell colSpan={2}>Totals</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatHours(rawTotalHours)}
              </TableCell>
              <TableCell />
              <TableCell className="text-right tabular-nums">
                {formatHours(totalHours)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCurrency(totalCost)}
              </TableCell>
              <TableCell />
            </TableRow>
          </TableBody>
        </Table>
      </div>
      <ContingencySummaryTable
        rows={scopedRoleBreakouts}
        clientPrice={scopedSummary.clientPrice}
        blendedRate={scopedBlendedRate}
        marginPercent={scopedSummary.marginPercent}
      />
    </div>
  );
}
