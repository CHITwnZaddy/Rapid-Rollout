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
      const [bidRes, scenarioRes, customerRes, migrationRes, scopedRes] =
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
            .select("scenario_type, summary_total_hours, summary_total_cost")
            .eq("proposal_id", proposalId)
            .order("scenario_type"),
          supabase
            .from("customers")
            .select("*")
            .order("company_name"),
          supabase
            .from("migration_config")
            .select("computed_total_cost")
            .eq("proposal_id", proposalId)
            .single(),
          supabase
            .from("scoped_services")
            .select("cost")
            .eq("proposal_id", proposalId),
        ]);

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

      const migrationData =
        !migrationRes.error && migrationRes.data
          ? (migrationRes.data as { computed_total_cost: number })
          : null;

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
      setScenarios(scenarioData);
      setCustomers(customerData);
      if (bidData?.customer_id) {
        setSelectedCustomer(
          customerData.find((c) => c.id === bidData!.customer_id) ?? null
        );
      }
      if (migrationData) {
        setMigrationTotal(Number(migrationData.computed_total_cost) || 0);
      }
      setScopedTotal(scopedData.reduce((sum, s) => sum + Number(s.cost), 0));
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
    (sum, sc) => sum + Number(sc.summary_total_cost),
    0
  );
  const totalHours = scenarios.reduce(
    (sum, sc) => sum + Number(sc.summary_total_hours),
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
                    {formatHours(Number(s.summary_total_hours))}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(Number(s.summary_total_cost))}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell className="font-medium">Migration Services</TableCell>
                <TableCell className="text-right">-</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(migrationTotal)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Scoped Services</TableCell>
                <TableCell className="text-right">-</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(scopedTotal)}
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
