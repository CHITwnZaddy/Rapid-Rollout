"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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
import { ScopedComplexityFactor } from "@/components/proposals/scoped-complexity-factor";

const SERVICE_TYPES = [
  "01 Data Fix",
  "02 Mail Merge",
  "03 Remote Pro Svcs - Design Session(s)",
  "04 Remote Pro Svcs - Requirements Creation",
  "05 Other",
];

interface ScopedServiceLine {
  id: string;
  service_type: string;
  description: string | null;
  hours: number;
  rate_card_lookup_key: string;
  cost: number;
  row_order: number;
}

export default function ScopedServicesPage() {
  const { id: proposalId } = useParams<{ id: string }>();
  const supabase = createClient();

  const [lines, setLines] = useState<ScopedServiceLine[]>([]);
  const [rateCards, setRateCards] = useState<RateCardRow[]>([]);
  const [complexityFactor, setComplexityFactor] = useState<number>(1);
  const rateCardMap = useMemo(() => buildRateCardMap(rateCards), [rateCards]);

  useEffect(() => {
    const load = async () => {
      const [{ data: scopedData }, { data: rateData }, { data: proposalData }] =
        await Promise.all([
          supabase
            .from("scoped_services")
            .select("*")
            .eq("proposal_id", proposalId)
            .order("row_order"),
          supabase.from("rate_cards").select("*").eq("status", "Active"),
          supabase
            .from("proposals")
            .select("scoped_complexity_factor")
            .eq("id", proposalId)
            .single(),
        ]);
      if (scopedData) setLines(scopedData);
      if (rateData) setRateCards(rateData);
      if (proposalData)
        setComplexityFactor(Number(proposalData.scoped_complexity_factor ?? 1));
    };
    load();
  }, [proposalId, supabase]);

  const addLine = useCallback(async () => {
    const defaultLookupKey = rateCards[0]?.lookup_key ?? "Master|Sr. Implementation Manager";
    const { data } = await supabase
      .from("scoped_services")
      .insert({
        proposal_id: proposalId,
        service_type: SERVICE_TYPES[0],
        description: "",
        hours: 0,
        rate_card_lookup_key: defaultLookupKey,
        cost: 0,
        row_order: lines.length,
      })
      .select()
      .single();

    if (data) setLines((prev) => [...prev, data]);
  }, [lines.length, proposalId, rateCards, supabase]);

  const updateLine = useCallback(
    async (lineId: string, field: string, value: string | number | null) => {
      setLines((prev) =>
        prev.map((l) => {
          if (l.id !== lineId) return l;
          const updated = { ...l, [field]: value };
          // Recalculate cost
          const rate = rateCardMap.get(updated.rate_card_lookup_key) ?? 0;
          updated.cost = updated.hours * rate;
          return updated;
        })
      );

      // Find updated line for DB save
      const line = lines.find((l) => l.id === lineId);
      if (!line) return;
      const updated = { ...line, [field]: value };
      const rate = rateCardMap.get(updated.rate_card_lookup_key) ?? 0;
      updated.cost = updated.hours * rate;

      await supabase
        .from("scoped_services")
        .update({
          service_type: updated.service_type,
          description: updated.description,
          hours: updated.hours,
          rate_card_lookup_key: updated.rate_card_lookup_key,
          cost: updated.cost,
        })
        .eq("id", lineId);
    },
    [lines, rateCardMap, supabase]
  );

  const removeLine = useCallback(
    async (lineId: string) => {
      await supabase.from("scoped_services").delete().eq("id", lineId);
      setLines((prev) => prev.filter((l) => l.id !== lineId));
    },
    [supabase]
  );

  const rawTotalCost = lines.reduce((sum, l) => sum + l.cost, 0);
  const rawTotalHours = lines.reduce((sum, l) => sum + l.hours, 0);
  const totalCost = applyComplexity(rawTotalCost, complexityFactor);
  const totalHours = applyComplexity(rawTotalHours, complexityFactor);

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
        <Button onClick={addLine} size="sm">
          Add Line
        </Button>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[220px]">Service Type</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-[100px] text-right">Hours</TableHead>
              <TableHead className="w-[200px]">Rate Card</TableHead>
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
                    onValueChange={(v) => updateLine(line.id, "service_type", v)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SERVICE_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Input
                    className="h-8 text-xs"
                    value={line.description ?? ""}
                    onChange={(e) =>
                      updateLine(line.id, "description", e.target.value)
                    }
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
                    onChange={(e) =>
                      updateLine(
                        line.id,
                        "hours",
                        parseFloat(e.target.value) || 0
                      )
                    }
                  />
                </TableCell>
                <TableCell>
                  <Select
                    value={line.rate_card_lookup_key}
                    onValueChange={(v) =>
                      updateLine(line.id, "rate_card_lookup_key", v)
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {rateCards.map((rc) => (
                        <SelectItem key={rc.lookup_key} value={rc.lookup_key}>
                          {rc.activity} ({formatCurrency(rc.rate)}/hr)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-right tabular-nums font-medium">
                  {formatCurrency(applyComplexity(line.cost, complexityFactor))}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-destructive"
                    onClick={() => removeLine(line.id)}
                  >
                    Remove
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {lines.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-8 text-center text-muted-foreground"
                >
                  No scoped services. Click &quot;Add Line&quot; to start.
                </TableCell>
              </TableRow>
            )}
            <TableRow className="bg-muted/50 font-semibold">
              <TableCell colSpan={2}>Totals</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatHours(totalHours)}
              </TableCell>
              <TableCell />
              <TableCell className="text-right tabular-nums">
                {formatCurrency(totalCost)}
              </TableCell>
              <TableCell />
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
