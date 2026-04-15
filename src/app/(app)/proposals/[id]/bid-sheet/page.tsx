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

interface Customer {
  id: string;
  company_name: string;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
}

interface ScenarioData {
  scenario_type: string;
  summary_total_hours: number;
  summary_total_cost: number;
}

interface BidSheetData {
  id: string;
  customer_id: string | null;
  discount_percent: number;
  discount_dollars: number;
  notes: string | null;
}

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
          supabase
            .from("bid_sheets")
            .select("id, customer_id, discount_percent, discount_dollars, notes")
            .eq("proposal_id", proposalId)
            .single(),
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

      const bidData = bidRes.data as BidSheetData | null;
      const scenarioData = scenarioRes.data as ScenarioData[] | null;
      const customerData = customerRes.data as Customer[] | null;
      const migrationData = migrationRes.data as { computed_total_cost: number } | null;
      const scopedData = scopedRes.data as { cost: number }[] | null;

      if (bidData) setBidSheet(bidData);
      if (scenarioData) setScenarios(scenarioData);
      if (customerData) {
        setCustomers(customerData);
        if (bidData?.customer_id) {
          setSelectedCustomer(
            customerData.find((c) => c.id === bidData.customer_id) ?? null
          );
        }
      }
      if (migrationData) {
        setMigrationTotal(Number(migrationData.computed_total_cost) || 0);
      }
      if (scopedData) {
        setScopedTotal(
          scopedData.reduce((sum, s) => sum + Number(s.cost), 0)
        );
      }
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
    if (bidSheet) {
      setBidSheet({ ...bidSheet, discount_percent: discountPercent });
      await supabase
        .from("bid_sheets")
        .update({ discount_percent: discountPercent })
        .eq("id", bidSheet.id);
    }
  };

  const handleDiscountDollarsChange = async (discountDollars: number) => {
    if (bidSheet) {
      setBidSheet({ ...bidSheet, discount_dollars: discountDollars });
      await supabase
        .from("bid_sheets")
        .update({ discount_dollars: discountDollars })
        .eq("id", bidSheet.id);
    }
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

          <div className="mt-4 flex items-center gap-4">
            <Label>Discount $</Label>
            <Input
              className="w-28"
              type="number"
              min={0}
              step={1}
              value={discountDollars}
              onChange={(e) =>
                handleDiscountDollarsChange(parseFloat(e.target.value) || 0)
              }
            />
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
