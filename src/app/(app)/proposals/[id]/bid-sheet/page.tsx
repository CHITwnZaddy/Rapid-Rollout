"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useParams } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/calculations/engine";
import {
  calculateMigrationTotals,
  type MigrationConfig as EngineMigrationConfig,
} from "@/lib/calculations/migration-engine";
import { applyComplexity } from "@/lib/calculations/complexity";
import { NUM } from "@/lib/calculations/num";
import { hasMigrationSection, toEngineLine } from "@/lib/calculations/adapters";
import {
  discountPercentSchema,
  discountDollarsSchema,
} from "@/lib/validation/bid-sheet";
import {
  updateBidSheetCredit,
  updateBidSheetDiscountPercent,
  updateBidSheetNotes,
} from "./actions";
import {
  safeParseSupabaseResult,
} from "@/lib/validation/parse-supabase";
import {
  getLoadError,
  getRequiredRateCardsError,
} from "@/lib/pricing/load-guards";
import {
  BidSheetDataSchema,
  CustomerSchema,
  ScenarioDataSchema,
  ScopedCostSchema,
  type BidSheetData,
  type Customer,
  type ScenarioData,
} from "@/lib/validation/proposal";
import { z } from "zod";
import { toast } from "sonner";
import { Download } from "lucide-react";
import {
  INTERNAL_COST_RATE_KEY,
  PM_RATE_KEY,
  SR_IM_RATE_KEY,
  TRAVEL_RATE_KEY,
} from "@/lib/rate-card-keys";
import { buildBidSheetViewModel } from "@/lib/proposals/bid-sheet-view-model";
import { SCENARIO_ORDER } from "@/lib/scenarios/display";

const BID_SHEET_REQUIRED_RATE_KEYS = [
  SR_IM_RATE_KEY,
  PM_RATE_KEY,
  TRAVEL_RATE_KEY,
  INTERNAL_COST_RATE_KEY,
] as const;

export default function BidSheetPage() {
  const { id: proposalId } = useParams<{ id: string }>();
  const supabase = createClient();

  const [bidSheet, setBidSheet] = useState<BidSheetData | null>(null);
  const [scenarios, setScenarios] = useState<ScenarioData[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null
  );
  const [migrationTotal, setMigrationTotal] = useState(0);
  const [scopedTotal, setScopedTotal] = useState(0);
  const [discountPercentDraft, setDiscountPercentDraft] = useState("0");
  const [discountDollarsDraft, setDiscountDollarsDraft] = useState("0");
  const [notesDraft, setNotesDraft] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingDiscountPercent, setSavingDiscountPercent] = useState(false);
  const [savingDiscountDollars, setSavingDiscountDollars] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setLoadError(null);

      const failLoad = (message: string) => {
        setLoadError(message);
        toast.error(message);
      };

      try {
        const [
          bidRes,
          scenarioRes,
          customerRes,
          migCfgRes,
          migLinesRes,
          ratesRes,
          scopedRes,
          proposalRes,
        ] = await Promise.all([
          supabase
            .from("bid_sheets")
            .select("id, customer_id, discount_percent, discount_dollars, notes")
            .eq("proposal_id", proposalId)
            .maybeSingle(),
          supabase
            .from("scenarios")
            .select(
              "scenario_type, summary_total_hours, summary_total_cost, complexity_factor"
            )
            .eq("proposal_id", proposalId)
            .order("scenario_type"),
          supabase.from("customers").select("*").order("company_name"),
          supabase
            .from("migration_config")
            .select(
              "num_projects, hrs_per_import, lines_per_import_file, is_effort_included, is_workshop_included, complexity_factor, sr_im_trips, pm_trips, doc_avg_mb_per_project, doc_mb_per_hour, core_requirements_hrs, core_migration_plan_hrs, core_validation_hrs, core_final_qa_hrs, core_pm_oversight_hrs"
            )
            .eq("proposal_id", proposalId)
            .single(),
          supabase
            .from("migration_detail_lines")
            .select(
              "id, section, label, quantity, items_per_object, total_line_items, row_order"
            )
            .eq("proposal_id", proposalId)
            .order("row_order"),
          supabase
            .from("rate_cards")
            .select("lookup_key, rate")
            .eq("status", "Active")
            .in("lookup_key", BID_SHEET_REQUIRED_RATE_KEYS),
          supabase
            .from("scoped_services")
            .select("cost")
            .eq("proposal_id", proposalId),
          supabase
            .from("proposals")
            .select("scoped_complexity_factor")
            .eq("id", proposalId)
            .single(),
        ]);

        if (bidRes.error) {
          failLoad(`Failed to load bid sheet: ${bidRes.error.message}`);
          return;
        }

        const queryLoadError =
          getLoadError(scenarioRes, "scenarios") ??
          getLoadError(customerRes, "customers") ??
          getLoadError(migCfgRes, "migration configuration") ??
          getLoadError(migLinesRes, "migration detail lines") ??
          getLoadError(ratesRes, "active rate cards") ??
          getLoadError(scopedRes, "scoped services") ??
          getLoadError(proposalRes, "proposal pricing factor");
        if (queryLoadError) {
          failLoad(queryLoadError);
          return;
        }

        const rateCardLoadError = getRequiredRateCardsError(
          ratesRes.data ?? [],
          BID_SHEET_REQUIRED_RATE_KEYS,
          "bid sheet migration pricing"
        );
        if (rateCardLoadError) {
          failLoad(rateCardLoadError);
          return;
        }

        const bidParsed = safeParseSupabaseResult(
          BidSheetDataSchema.nullable(),
          bidRes
        );
        if (!bidParsed.ok) {
          failLoad(`Bid sheet data is malformed: ${bidParsed.error}`);
          return;
        }
        const bidData: BidSheetData | null = bidParsed.data;
        if (!bidData) {
          failLoad(
            "This proposal is missing its bid sheet row. New proposals should no longer enter this state, so this likely indicates legacy bad data. Please contact support before editing this proposal."
          );
          return;
        }

        const scenarioParsed = safeParseSupabaseResult(
          z.array(ScenarioDataSchema),
          scenarioRes
        );
        if (!scenarioParsed.ok) {
          failLoad(`Scenario data failed to load: ${scenarioParsed.error}`);
          return;
        }

        const customerParsed = safeParseSupabaseResult(
          z.array(CustomerSchema),
          customerRes
        );
        if (!customerParsed.ok) {
          failLoad(`Customer list failed to load: ${customerParsed.error}`);
          return;
        }

        const scopedParsed = safeParseSupabaseResult(
          z.array(ScopedCostSchema),
          scopedRes
        );
        if (!scopedParsed.ok) {
          failLoad(`Scoped services failed to load: ${scopedParsed.error}`);
          return;
        }

        const scopedFactor =
          Number(proposalRes.data?.scoped_complexity_factor) || 1;
        const migCfg = migCfgRes.data;
        const migLines = migLinesRes.data ?? [];
        const rateRows = ratesRes.data ?? [];
        const srImRate = rateRows.find(
          (row) => row.lookup_key === SR_IM_RATE_KEY
        )?.rate;
        const pmRate = rateRows.find(
          (row) => row.lookup_key === PM_RATE_KEY
        )?.rate;
        const travelRate = rateRows.find(
          (row) => row.lookup_key === TRAVEL_RATE_KEY
        )?.rate;
        const internalCostRate = rateRows.find(
          (row) => row.lookup_key === INTERNAL_COST_RATE_KEY
        )?.rate;

        let liveMigrationTotal = 0;
        if (migCfg) {
          const engineCfg: EngineMigrationConfig = {
            num_projects: NUM(migCfg.num_projects),
            hrs_per_import: NUM(migCfg.hrs_per_import),
            lines_per_import_file: NUM(migCfg.lines_per_import_file),
            is_effort_included: migCfg.is_effort_included ?? false,
            is_workshop_included: migCfg.is_workshop_included ?? false,
            complexity_factor: NUM(migCfg.complexity_factor),
            sr_im_trips: NUM(migCfg.sr_im_trips),
            pm_trips: NUM(migCfg.pm_trips),
            doc_avg_mb_per_project: NUM(migCfg.doc_avg_mb_per_project),
            doc_mb_per_hour: NUM(migCfg.doc_mb_per_hour),
            core_requirements_hrs: NUM(migCfg.core_requirements_hrs),
            core_migration_plan_hrs: NUM(migCfg.core_migration_plan_hrs),
            core_validation_hrs: NUM(migCfg.core_validation_hrs),
            core_final_qa_hrs: NUM(migCfg.core_final_qa_hrs),
            core_pm_oversight_hrs: NUM(migCfg.core_pm_oversight_hrs),
          };
          liveMigrationTotal = calculateMigrationTotals(
            engineCfg,
            migLines
              .filter((line) => hasMigrationSection(line, "project"))
              .map((line) =>
                toEngineLine(line, {
                  quantityOverride: NUM(migCfg.num_projects),
                })
              ),
            migLines
              .filter((line) => hasMigrationSection(line, "workflow"))
              .map((line) => toEngineLine(line)),
            migLines
              .filter((line) => hasMigrationSection(line, "cost"))
              .map((line) => toEngineLine(line)),
            Number(srImRate),
            Number(pmRate),
            Number(travelRate),
            Number(internalCostRate)
          ).clientPrice;
        }

        const orderedScenarios = [...scenarioParsed.data].sort(
          (a, b) =>
            SCENARIO_ORDER.indexOf(
              a.scenario_type as (typeof SCENARIO_ORDER)[number]
            ) -
            SCENARIO_ORDER.indexOf(
              b.scenario_type as (typeof SCENARIO_ORDER)[number]
            )
        );

        setLoadError(null);
        setBidSheet(bidData);
        setDiscountPercentDraft(String(bidData.discount_percent ?? 0));
        setDiscountDollarsDraft(String(bidData.discount_dollars ?? 0));
        setNotesDraft(bidData.notes ?? "");
        setScenarios(orderedScenarios);
        setSelectedCustomer(
          bidData.customer_id
            ? customerParsed.data.find(
                (customer) => customer.id === bidData.customer_id
              ) ?? null
            : null
        );
        setMigrationTotal(liveMigrationTotal);
        setScopedTotal(
          applyComplexity(
            scopedParsed.data.reduce(
              (sum, scopedLine) => sum + Number(scopedLine.cost),
              0
            ),
            scopedFactor
          )
        );
      } catch (error) {
        failLoad(
          `Could not load bid sheet pricing data: ${
            error instanceof Error ? error.message : "unknown error"
          }.`
        );
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [proposalId, supabase]);

  const handleDiscountPercentSave = async () => {
    if (!bidSheet) return;
    const discountPercent = parseFloat(discountPercentDraft);
    const normalizedDiscountPercent = Number.isFinite(discountPercent)
      ? discountPercent
      : 0;
    if (normalizedDiscountPercent === (bidSheet.discount_percent ?? 0)) {
      setDiscountPercentDraft(String(bidSheet.discount_percent ?? 0));
      return;
    }
    const parsed = discountPercentSchema.safeParse(discountPercent);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid discount %");
      setDiscountPercentDraft(String(bidSheet.discount_percent ?? 0));
      return;
    }
    setSavingDiscountPercent(true);
    const result = await updateBidSheetDiscountPercent(
      proposalId,
      parsed.data
    );
    setSavingDiscountPercent(false);

    if (!result.ok) {
      toast.error(`Failed to save discount %: ${result.error}`);
      return;
    }

    setBidSheet({ ...bidSheet, discount_percent: parsed.data });
    setDiscountPercentDraft(String(parsed.data));
  };

  const handleDiscountDollarsSave = async () => {
    if (!bidSheet) return;
    const discountDollars = parseFloat(discountDollarsDraft);
    const normalizedDiscountDollars = Number.isFinite(discountDollars)
      ? discountDollars
      : 0;
    if (normalizedDiscountDollars === (bidSheet.discount_dollars ?? 0)) {
      setDiscountDollarsDraft(String(bidSheet.discount_dollars ?? 0));
      return;
    }
    const parsed = discountDollarsSchema.safeParse(discountDollars);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid discount $");
      setDiscountDollarsDraft(String(bidSheet.discount_dollars ?? 0));
      return;
    }
    setSavingDiscountDollars(true);
    const result = await updateBidSheetCredit(proposalId, parsed.data);
    setSavingDiscountDollars(false);

    if (!result.ok) {
      toast.error(`Failed to save credit: ${result.error}`);
      return;
    }

    setBidSheet({ ...bidSheet, discount_dollars: parsed.data });
    setDiscountDollarsDraft(String(parsed.data));
  };

  const handleNotesSave = async () => {
    if (!bidSheet || notesDraft === (bidSheet.notes ?? "")) return;

    setSavingNotes(true);
    const result = await updateBidSheetNotes(proposalId, notesDraft);
    setSavingNotes(false);

    if (!result.ok) {
      toast.error(`Failed to save notes: ${result.error}`);
      return;
    }

    setBidSheet({ ...bidSheet, notes: notesDraft });
  };

  const discountPercent = bidSheet?.discount_percent ?? 0;
  const discountDollars = bidSheet?.discount_dollars ?? 0;

  const { proposalSubtotal, pricing, bidLineItems } = buildBidSheetViewModel({
    scenarios,
    migrationTotal,
    scopedTotal,
    credit: discountDollars,
    discountPercent,
  });
  const finalTotal = pricing.finalTotal;

  const handleExport = async () => {
    try {
      const ExcelJS = (await import("exceljs")).default;
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Bid Summary");
      const titleFill = "FFC1C1DE";
      const headerFill = "FFD5D6E9";
      const altRowFill = "FFEAEAF4";
      const currencyFormat = "$#,##0.00";
      const baseFont = { name: "Calibri", size: 12 };
      const centeredHeaderAlignment = {
        horizontal: "center" as const,
        vertical: "middle" as const,
        wrapText: true,
      };
      const labelAlignment = {
        horizontal: "right" as const,
        vertical: "middle" as const,
        wrapText: true,
        indent: 1,
      };
      const valueAlignment = {
        horizontal: "left" as const,
        vertical: "middle" as const,
        wrapText: true,
        indent: 1,
      };

      worksheet.columns = [
        { key: "field", width: 28 },
        { key: "value", width: 42 },
      ];
      worksheet.mergeCells("A1:B1");
      worksheet.getCell("A1").value = "Bid Proposal";
      worksheet.addRow({});
      worksheet.addRow({
        field: "Customer Name",
        value: selectedCustomer?.company_name ?? "",
      });
      worksheet.addRow({
        field: "Customer Address",
        value: selectedCustomer
          ? [
              selectedCustomer.address_line1,
              selectedCustomer.address_line2,
              `${selectedCustomer.city}, ${selectedCustomer.state} ${selectedCustomer.zip}`,
            ]
              .filter(Boolean)
              .join("\n")
          : "",
      });
      worksheet.addRow({});
      worksheet.addRow({ field: "Line Item", value: "Client Price" });
      for (const item of bidLineItems) {
        worksheet.addRow({ field: item.displayLabel ?? item.label, value: item.clientPrice });
      }
      worksheet.addRow({ field: "Subtotal", value: proposalSubtotal });
      worksheet.addRow({ field: "Credit", value: discountDollars });
      worksheet.addRow({ field: "Discount %", value: discountPercent });
      worksheet.addRow({});
      worksheet.addRow({ field: "Final Total", value: finalTotal });
      worksheet.addRow({});
      worksheet.addRow({ field: "Notes", value: notesDraft });

      worksheet.getCell("A1").font = { ...baseFont, bold: true, size: 24 };
      worksheet.getCell("A1").alignment = {
        horizontal: "center",
        vertical: "middle",
      };
      worksheet.getCell("A1").fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: titleFill },
      };
      worksheet.getRow(1).height = 40;

      worksheet.eachRow((row) => {
        row.height = row.number === 4 ? 54 : 22;
        const fieldCell = row.getCell(1);
        const valueCell = row.getCell(2);
        if (row.number === 1) {
          row.height = 40;
          fieldCell.font = { ...baseFont, bold: true, size: 24 };
          fieldCell.alignment = {
            horizontal: "center",
            vertical: "middle",
          };
          fieldCell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: titleFill },
          };
          valueCell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: titleFill },
          };
          return;
        }
        fieldCell.font = { ...baseFont, bold: true };
        valueCell.font = { ...baseFont };
        fieldCell.alignment = labelAlignment;
        valueCell.alignment = valueAlignment;

        const fieldValue = String(fieldCell.value ?? "");
        if (fieldValue === "Line Item") {
          fieldCell.font = { ...baseFont, bold: true };
          valueCell.font = { ...baseFont, bold: true };
          fieldCell.alignment = centeredHeaderAlignment;
          valueCell.alignment = centeredHeaderAlignment;
          fieldCell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: headerFill },
          };
          valueCell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: headerFill },
          };
        }

        if (
          [
            "Phase 2",
            "Phase 3",
            "Option 2",
            "Option 3",
            "Migration Services",
            "Credit",
            "Final Total",
          ].includes(fieldValue)
        ) {
          fieldCell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: altRowFill },
          };
          valueCell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: altRowFill },
          };
        }

        if (["Subtotal", "Final Total"].includes(fieldValue)) {
          valueCell.font = { ...baseFont, bold: true };
        }

        if (["Credit", "Discount %"].includes(fieldValue)) {
          valueCell.font = { ...baseFont, italic: true };
        }

        if (
          [
            "Phase 1",
            "Phase 2",
            "Phase 3",
            "Option 1",
            "Option 2",
            "Option 3",
            "Scoped Services",
            "Migration Services",
            "Subtotal",
            "Credit",
            "Final Total",
          ].includes(fieldValue)
        ) {
          valueCell.numFmt = currencyFormat;
        }

        if (fieldValue === "Discount %") {
          valueCell.numFmt = "0.##";
        }

        if (fieldValue === "Discount %") {
          valueCell.border = {
            bottom: { style: "double", color: { argb: "FF000000" } },
          };
        }
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `bid-sheet-${selectedCustomer?.company_name ?? proposalId}-${new Date()
        .toISOString()
        .slice(0, 10)}.xlsx`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to export bid sheet. Please try again."
      );
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Loading Bid Sheet</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Pricing data is loading.
        </CardContent>
      </Card>
    );
  }

  if (loadError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Bid Sheet Unavailable</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>{loadError}</p>
          <p>
            This page no longer auto-creates missing bid sheet rows because that
            can hide underlying data problems.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Customer Info */}
      <Card>
        <CardHeader>
          <CardTitle>Customer Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Customer</Label>
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm font-medium">
                {selectedCustomer?.company_name ?? "No customer selected"}
              </div>
            </div>
            {selectedCustomer && (
              <div className="text-sm text-muted-foreground">
                <p>{selectedCustomer.address_line1}</p>
                {selectedCustomer.address_line2 && (
                  <p>{selectedCustomer.address_line2}</p>
                )}
                <p>
                  {selectedCustomer.city}, {selectedCustomer.state}{" "}
                  {selectedCustomer.zip}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Pricing Summary */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Pricing Summary</CardTitle>
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={() => void handleExport()}
            aria-label="Export Bid Sheet XLSX"
          >
            <Download className="mr-2 size-4" aria-hidden="true" />
            Export Bid Sheet XLSX
          </Button>
        </CardHeader>
        <CardContent>
          {bidLineItems.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No scenarios configured yet — add hours on a Phase or Option
              tab, Scoped Services, or Migration Services.
            </p>
          ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Line Item</TableHead>
                <TableHead className="text-right">Client Price</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bidLineItems.map((item) => (
                <TableRow key={item.label}>
                  <TableCell className="font-medium">
                    {item.displayLabel}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(item.clientPrice)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/50 font-semibold">
                <TableCell>Subtotal</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(proposalSubtotal)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
          )}

          <div className="mt-4 flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label>Credit</Label>
              <Input
                className="w-32"
                type="number"
                min={0}
                step={0.01}
                value={discountDollarsDraft}
                disabled={savingDiscountDollars}
                onChange={(e) => setDiscountDollarsDraft(e.target.value)}
                onBlur={handleDiscountDollarsSave}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.currentTarget.blur();
                  }
                }}
              />
              <p className="text-xs text-muted-foreground">
                Deducts from total. Use for negotiated credits or from the LoE.
              </p>
            </div>
            <div className="space-y-1">
              <Label>Discount %</Label>
              <Input
                className="w-24"
                type="number"
                min={0}
                max={100}
                step={0.01}
                value={discountPercentDraft}
                disabled={savingDiscountPercent}
                onChange={(e) => setDiscountPercentDraft(e.target.value)}
                onBlur={handleDiscountPercentSave}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.currentTarget.blur();
                  }
                }}
              />
            </div>
            <span className="text-lg font-bold">
              Total: {formatCurrency(finalTotal)}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Notes */}
      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            rows={4}
            value={notesDraft}
            disabled={savingNotes}
            onChange={(e) => setNotesDraft(e.target.value)}
            onBlur={handleNotesSave}
            placeholder="Additional notes for the bid..."
          />
        </CardContent>
      </Card>
    </div>
  );
}
