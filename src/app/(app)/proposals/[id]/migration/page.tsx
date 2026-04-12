"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/calculations/engine";
import type { Json } from "@/types/database";

interface MigrationLine {
  id: string;
  line_label: string;
  sales_price: number;
  migration_detail: Json | null;
  row_order: number;
}

export default function MigrationPage() {
  const { id: proposalId } = useParams<{ id: string }>();
  const supabase = createClient();
  const [lines, setLines] = useState<MigrationLine[]>([]);

  useEffect(() => {
    supabase
      .from("migration_services")
      .select("*")
      .eq("proposal_id", proposalId)
      .order("row_order")
      .then(({ data }) => {
        if (data) setLines(data);
      });
  }, [proposalId, supabase]);

  const addLine = useCallback(async () => {
    const { data } = await supabase
      .from("migration_services")
      .insert({
        proposal_id: proposalId,
        line_label: "New Migration Item",
        sales_price: 0,
        row_order: lines.length,
      })
      .select()
      .single();

    if (data) setLines((prev) => [...prev, data]);
  }, [lines.length, proposalId, supabase]);

  const updateLineLabel = useCallback(
    async (lineId: string, line_label: string) => {
      setLines((prev) =>
        prev.map((l) => (l.id === lineId ? { ...l, line_label } : l))
      );
      await supabase
        .from("migration_services")
        .update({ line_label })
        .eq("id", lineId);
    },
    [supabase]
  );

  const updateSalesPrice = useCallback(
    async (lineId: string, sales_price: number) => {
      setLines((prev) =>
        prev.map((l) => (l.id === lineId ? { ...l, sales_price } : l))
      );
      await supabase
        .from("migration_services")
        .update({ sales_price })
        .eq("id", lineId);
    },
    [supabase]
  );

  const removeLine = useCallback(
    async (lineId: string) => {
      await supabase.from("migration_services").delete().eq("id", lineId);
      setLines((prev) => prev.filter((l) => l.id !== lineId));
    },
    [supabase]
  );

  const totalPrice = lines.reduce((sum, l) => sum + Number(l.sales_price), 0);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Migration Services</h2>
        <Button onClick={addLine} size="sm">
          Add Line
        </Button>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Line Item</TableHead>
              <TableHead className="w-[160px] text-right">
                Sales Price
              </TableHead>
              <TableHead className="w-[60px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line) => (
              <TableRow key={line.id}>
                <TableCell>
                  <Input
                    className="h-8"
                    value={line.line_label}
                    onChange={(e) =>
                      updateLineLabel(line.id, e.target.value)
                    }
                  />
                </TableCell>
                <TableCell>
                  <Input
                    className="h-8 text-right"
                    type="number"
                    min={0}
                    step={100}
                    value={line.sales_price}
                    onChange={(e) =>
                      updateSalesPrice(
                        line.id,
                        parseFloat(e.target.value) || 0
                      )
                    }
                  />
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
                  colSpan={3}
                  className="py-8 text-center text-muted-foreground"
                >
                  No migration services. Click "Add Line" to start.
                </TableCell>
              </TableRow>
            )}
            <TableRow className="bg-muted/50 font-semibold">
              <TableCell>Total</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCurrency(totalPrice)}
              </TableCell>
              <TableCell />
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
