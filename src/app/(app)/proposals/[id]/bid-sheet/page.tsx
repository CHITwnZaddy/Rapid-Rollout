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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatHours } from "@/lib/calculations/engine";
import {
  calculateMigrationTotals,
  type MigrationConfig as EngineMigrationConfig,
} from "@/lib/calculations/migration-engine";
import { applyComplexity } from "@/lib/calculations/complexity";
import { NUM } from "@/lib/calculations/num";
import { toEngineLine } from "@/lib/calculations/adapters";
import {
  discountPercentSchema,
  discountDollarsSchema,
} from "@/lib/validation/bid-sheet";
import {
  safeParseSupabaseResult,
} from "@/lib/validation/parse-supabase";
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

export default function BidSheetPage() {
  const { id: proposalId } = useParams<{ id: string }>();
  const supabase = createClient();

  const [bidSheet, setBidSheet] = useState<BidSheetData | null>(null);
  const [scenarios, setScenarios] = useState<ScenarioData[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null
  );
  const [migrationTotal, setMigrationTotal] = useState(0);
  const [scopedTotal, setScopedTotal] = useState(0);

  useEffect(() => {
    const load = async () => {
      const [bidRes, scenarioRes, customerRes, migCfgRes, migLinesRes, ratesRes, scopedRes, proposalRes] =
        await Promise.all([
          // maybeSingle() instead of single() so a missing row comes
          // back as data=null instead of an error — lets us heal the
          // proposal by creating the row on the fly.
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
          supabase
            .from("customers")
            .select("*")
            .order("company_name"),
          // Full config fields needed for live migration total computation.
          supabase
            .from("migration_config")
            .select(
              "num_projects, hrs_per_import, lines_per_import_file, is_effort_included, is_workshop_included, ba_complexity_factor, pm_complexity_factor, ba_trips, pm_trips, doc_avg_mb_per_project, doc_mb_per_hour, core_requirements_hrs, core_migration_plan_hrs, core_validation_hrs, core_final_qa_hrs, core_pm_oversight_hrs"
            )
            .eq("proposal_id", proposalId)
            .single(),
          supabase
            .from("migration_detail_lines")
            .select("id, section, label, quantity, items_per_object, total_line_items, row_order")
            .eq("proposal_id", proposalId)
            .order("row_order"),
          supabase
            .from("rate_cards")
            .select("lookup_key, rate")
            .in("lookup_key", [
              "Master|Business Analyst",
              "Master|Program Manager",
              "Master|Travel Cost/Trip",
            ]),
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

      const scopedFactor =
        Number(proposalRes.data?.scoped_complexity_factor) || 1;

      if (bidRes.error) {
        toast.error(`Failed to load bid sheet: ${bidRes.error.message}`);
        return;
      }

      const bidParsed = safeParseSupabaseResult(
        BidSheetDataSchema.nullable(),
        bidRes
      );
      if (!bidParsed.ok) {
        toast.error(`Bid sheet data is malformed: ${bidParsed.error}`);
        return;
      }
      let bidData: BidSheetData | null = bidParsed.data;

      const scenarioParsed = safeParseSupabaseResult(
        z.array(ScenarioDataSchema),
        scenarioRes
      );
      const scenarioData: ScenarioData[] = scenarioParsed.ok
        ? scenarioParsed.data
        : [];
      if (!scenarioParsed.ok) {
        toast.error(`Scenario data failed to load: ${scenarioParsed.error}`);
      }

      const customerParsed = safeParseSupabaseResult(
        z.array(CustomerSchema),
        customerRes
      );
      const customerData: Customer[] = customerParsed.ok
        ? customerParsed.data
        : [];
      if (!customerParsed.ok) {
        toast.error(`Customer list failed to load: ${customerParsed.error}`);
      }

      const scopedParsed = safeParseSupabaseResult(
        z.array(ScopedCostSchema),
        scopedRes
      );
      const scopedData = scopedParsed.ok ? scopedParsed.data : [];

      // Compute migration total live — same approach as the Summary and
      // Scenario Breakout pages — so the bid sheet always reflects the
      // current section data rather than the stored computed_total_cost
      // snapshot which only updates when the migration page saves.
      const migCfg = !migCfgRes.error ? migCfgRes.data : null;
      const migLines = migLinesRes.data ?? [];
      const rateRows = ratesRes.data ?? [];
      const baRate = rateRows.find((r) => r.lookup_key === "Master|Business Analyst")?.rate;
      const pmRate = rateRows.find((r) => r.lookup_key === "Master|Program Manager")?.rate;
      const travelRate = rateRows.find((r) => r.lookup_key === "Master|Travel Cost/Trip")?.rate;

      // Fail closed on missing rate-card rows. Previously we silently
      // left liveMigrationTotal at 0 — that hid the Sr. IM-class bug
      // where a renamed lookup_key made migration cost vanish from
      // the bid sheet without any user-visible error.
      let liveMigrationTotal = 0;
      if (migCfg) {
        if (baRate == null || pmRate == null || travelRate == null) {
          toast.error(
            "Migration total unavailable: one or more required rate card rows are missing (Business Analyst, Program Manager, Travel Cost/Trip). Ask an admin to seed these."
          );
          return;
        }
        const numP = NUM(migCfg.num_projects);
        const engineCfg: EngineMigrationConfig = {
          num_projects: numP,
          hrs_per_import: NUM(migCfg.hrs_per_import),
          lines_per_import_file: NUM(migCfg.lines_per_import_file),
          is_effort_included: migCfg.is_effort_included,
          is_workshop_included: migCfg.is_workshop_included,
          pm_contingency_pct: 0,
          ba_complexity_factor: NUM(migCfg.ba_complexity_factor),
          pm_complexity_factor: NUM(migCfg.pm_complexity_factor),
          ba_trips: NUM(migCfg.ba_trips),
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
            .filter((l) => l.section === "project")
            .map((l) => toEngineLine(l, { quantityOverride: NUM(migCfg.num_projects) })),
          migLines
            .filter((l) => l.section === "workflow")
            .map((l) => toEngineLine(l)),
          migLines
            .filter((l) => l.section === "cost")
            .map((l) => toEngineLine(l)),
          Number(baRate),
          Number(pmRate),
          Number(travelRate)
        ).salesPrice;
      }

      // Self-heal: if no bid_sheets row exists for this proposal
      // (e.g. because the new-proposal flow failed silently on
      // insert), create one now so the form becomes editable
      // instead of silently refusing every keystroke.
      if (!bidData) {
        const { data: created, error: insertError } = await supabase
          .from("bid_sheets")
          .insert({ proposal_id: proposalId })
          .select("id, customer_id, discount_percent, discount_dollars, notes")
          .single();
        if (insertError || !created) {
          toast.error(
            `Unable to initialize bid sheet: ${insertError?.message ?? "unknown error"}`
          );
          return;
        }
        const selfHealParsed = safeParseSupabaseResult(
          BidSheetDataSchema,
          { data: created, error: insertError }
        );
        if (!selfHealParsed.ok) {
          toast.error(`Unable to initialize bid sheet: ${selfHealParsed.error}`);
          return;
        }
        bidData = selfHealParsed.data;
      }

      setBidSheet(bidData);
      const scenarioOrder = ["P1", "P2", "Opt1", "Opt2"];
      const orderedScenarios = [...scenarioData].sort(
        (a, b) =>
          scenarioOrder.indexOf(a.scenario_type) -
          scenarioOrder.indexOf(b.scenario_type)
      );
      setScenarios(orderedScenarios);
      setCustomers(customerData);
      if (bidData?.customer_id) {
        setSelectedCustomer(
          customerData.find((c) => c.id === bidData!.customer_id) ?? null
        );
      }
      setMigrationTotal(liveMigrationTotal);
      setScopedTotal(
        applyComplexity(
          scopedData.reduce((sum, s) => sum + Number(s.cost), 0),
          scopedFactor
        )
      );
    };
    load();
  }, [proposalId, supabase]);

  const handleCustomerChange = async (customerId: string | null) => {
    if (!customerId) return;
    const customer = customers.find((c) => c.id === customerId) ?? null;
    setSelectedCustomer(customer);
    if (bidSheet) {
      await supabase
        .from("bid_sheets")
        .update({ customer_id: customerId })
        .eq("id", bidSheet.id);
    }
  };

  const handleDiscountPercentChange = async (discountPercent: number) => {
    if (!bidSheet) return;
    const parsed = discountPercentSchema.safeParse(discountPercent);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid discount %");
      return;
    }
    setBidSheet({ ...bidSheet, discount_percent: parsed.data });
    const { error } = await supabase
      .from("bid_sheets")
      .update({ discount_percent: parsed.data })
      .eq("id", bidSheet.id);
    if (error) toast.error(`Failed to save discount %: ${error.message}`);
  };

  const handleDiscountDollarsChange = async (discountDollars: number) => {
    if (!bidSheet) return;
    const parsed = discountDollarsSchema.safeParse(discountDollars);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid discount $");
      return;
    }
    setBidSheet({ ...bidSheet, discount_dollars: parsed.data });
    const { error } = await supabase
      .from("bid_sheets")
      .update({ discount_dollars: parsed.data })
      .eq("id", bidSheet.id);
    if (error) toast.error(`Failed to save discount $: ${error.message}`);
  };

  const handleNotesChange = async (notes: string) => {
    if (bidSheet) {
      setBidSheet({ ...bidSheet, notes });
      await supabase
        .from("bid_sheets")
        .update({ notes })
        .eq("id", bidSheet.id);
    }
  };

  const discountPercent = bidSheet?.discount_percent ?? 0;
  const discountDollars = bidSheet?.discount_dollars ?? 0;

  const scenarioSubtotal = scenarios.reduce(
    (sum, sc) =>
      sum +
      applyComplexity(
        Number(sc.summary_total_cost),
        Number(sc.complexity_factor ?? 1)
      ),
    0
  );
  const totalHours = scenarios.reduce(
    (sum, sc) =>
      sum +
      applyComplexity(
        Number(sc.summary_total_hours),
        Number(sc.complexity_factor ?? 1)
      ),
    0
  );

  const afterDollar = Math.max(0, scenarioSubtotal - discountDollars);
  const discountedScenarioTotal = afterDollar * (1 - discountPercent / 100);
  const proposalSubtotal = scenarioSubtotal + migrationTotal + scopedTotal;
  const finalTotal = discountedScenarioTotal + migrationTotal + scopedTotal;

  const blendedRate = totalHours > 0 ? finalTotal / totalHours : 0;
  const blendedRateMeetsTarget = blendedRate >= 225;

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
              <Select
                value={selectedCustomer?.id ?? ""}
                onValueChange={handleCustomerChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select customer">
                    {selectedCustomer?.company_name ?? "Select customer"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.company_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
        <CardHeader>
          <CardTitle>Pricing Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Line Item</TableHead>
                <TableHead className="text-right">Hours</TableHead>
                <TableHead className="text-right">Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scenarios.map((s) => (
                <TableRow key={s.scenario_type}>
                  <TableCell className="font-medium">
                    {s.scenario_type}
                    {Number(s.summary_total_cost) === 0 && (
                      <Badge variant="secondary" className="ml-2">
                        Empty
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatHours(
                      applyComplexity(
                        Number(s.summary_total_hours),
                        Number(s.complexity_factor ?? 1)
                      )
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(
                      applyComplexity(
                        Number(s.summary_total_cost),
                        Number(s.complexity_factor ?? 1)
                      )
                    )}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell className="font-medium">Scoped Services</TableCell>
                <TableCell className="text-right">-</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(scopedTotal)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Migration Services</TableCell>
                <TableCell className="text-right">-</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(migrationTotal)}
                </TableCell>
              </TableRow>
              <TableRow className="bg-muted/50 font-semibold">
                <TableCell>Subtotal</TableCell>
                <TableCell />
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(proposalSubtotal)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>

          <div className="mt-4 flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label>Credit</Label>
              <Input
                className="w-32"
                type="number"
                min={0}
                step={1}
                value={discountDollars}
                onChange={(e) =>
                  handleDiscountDollarsChange(parseFloat(e.target.value) || 0)
                }
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
                step={1}
                value={discountPercent}
                onChange={(e) =>
                  handleDiscountPercentChange(parseFloat(e.target.value) || 0)
                }
              />
            </div>
            <span className="text-lg font-bold">
              Total: {formatCurrency(finalTotal)}
            </span>
            <Badge
              variant={blendedRateMeetsTarget ? "secondary" : "destructive"}
              className={blendedRateMeetsTarget ? "bg-green-100 text-green-800 hover:bg-green-100" : ""}
            >
              Blended Rate: {formatCurrency(blendedRate)}
            </Badge>
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
            value={bidSheet?.notes ?? ""}
            onChange={(e) => handleNotesChange(e.target.value)}
            placeholder="Additional notes for the bid..."
          />
        </CardContent>
      </Card>
    </div>
  );
}
