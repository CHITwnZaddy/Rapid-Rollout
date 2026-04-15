"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { newProposalSchema } from "@/lib/validation/proposal";
import { toast } from "sonner";

interface Customer {
  id: string;
  company_name: string;
}

export default function NewProposalPage() {
  const [name, setName] = useState("");
  const [customerId, setCustomerId] = useState<string>("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    supabase
      .from("customers")
      .select("id, company_name")
      .order("company_name")
      .then(({ data }) => {
        if (data) setCustomers(data);
      });
  }, [supabase]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate at the form boundary before touching Supabase.
    // Trim/bounds-check `name` and enforce that customerId is
    // either empty or a real UUID — prevents whitespace-only
    // proposals from polluting the dashboard.
    const parsed = newProposalSchema.safeParse({ name, customerId });
    if (!parsed.success) {
      const msg =
        parsed.error.issues[0]?.message ?? "Invalid proposal input";
      setError(msg);
      toast.error(msg);
      return;
    }
    const { name: validName, customerId: validCustomerId } = parsed.data;

    setLoading(true);

    // Phase 2.4 — restructure the new-proposal flow into
    // dependency levels to eliminate the 8-step serial waterfall
    // that used to block the SE for ~1-2s after clicking Create.
    //
    // Level 0 (no deps):   auth.getUser, service_hours fetch
    // Level 1 (user.id):   proposals insert (returns proposal.id)
    // Level 2 (propId):    scenarios insert + bid_sheet + migration_config
    //                      + migration_detail_lines (all parallel)
    // Level 3 (scenarioIds + modules): scenario_lines insert
    //
    // We also use .select() on the scenarios insert to get the new
    // row ids back inline — this eliminates a separate SELECT that
    // used to run after the insert.

    // ─── Level 0: fetch user + service modules in parallel ──
    const [userRes, servicesRes] = await Promise.all([
      supabase.auth.getUser(),
      supabase
        .from("service_hours")
        .select("service_name")
        .eq("status", "Active")
        .order("service_name"),
    ]);

    const user = userRes.data.user;
    if (!user) {
      setError("You must be logged in.");
      setLoading(false);
      return;
    }

    // Derive unique module names preserving order.
    const uniqueModules: string[] = [];
    if (servicesRes.data) {
      const seen = new Set<string>();
      for (const s of servicesRes.data) {
        if (!seen.has(s.service_name)) {
          seen.add(s.service_name);
          uniqueModules.push(s.service_name);
        }
      }
    }

    // ─── Level 1: create the proposal ──────────────────────
    const { data: proposal, error: proposalError } = await supabase
      .from("proposals")
      .insert({
        name: validName,
        customer_id: validCustomerId || null,
        created_by: user.id,
      })
      .select()
      .single();

    if (proposalError || !proposal) {
      setError(proposalError?.message ?? "Failed to create proposal");
      setLoading(false);
      return;
    }

    // Build the static migration_detail_lines payload once so it
    // can fan out in parallel with the other Level 2 inserts.
    const migrationDefaults = [
      // Project lines
      { proposal_id: proposal.id, section: "project", label: "Project Info/Detail", quantity: 0, items_per_object: 0, total_line_items: 0, row_order: 0 },
      { proposal_id: proposal.id, section: "project", label: "Schedules", quantity: 0, items_per_object: 0, total_line_items: 0, row_order: 1 },
      // Workflow lines (11 default rows)
      ...Array.from({ length: 11 }, (_, i) => ({
        proposal_id: proposal.id, section: "workflow", label: "WF Object Name", quantity: 0, items_per_object: 0, total_line_items: 0, row_order: i,
      })),
      // Cost lines
      { proposal_id: proposal.id, section: "cost", label: "Budgets", quantity: 1, items_per_object: 0, total_line_items: 0, row_order: 0 },
      { proposal_id: proposal.id, section: "cost", label: "Commitments", quantity: 0, items_per_object: 0, total_line_items: 0, row_order: 1 },
      { proposal_id: proposal.id, section: "cost", label: "Commitment Changes", quantity: 0, items_per_object: 0, total_line_items: 0, row_order: 2 },
      { proposal_id: proposal.id, section: "cost", label: "Commitment Invoices", quantity: 0, items_per_object: 0, total_line_items: 0, row_order: 3 },
      { proposal_id: proposal.id, section: "cost", label: "General Invoices", quantity: 0, items_per_object: 0, total_line_items: 0, row_order: 4 },
      { proposal_id: proposal.id, section: "cost", label: "TBD", quantity: 0, items_per_object: 0, total_line_items: 0, row_order: 5 },
      { proposal_id: proposal.id, section: "cost", label: "TBD", quantity: 0, items_per_object: 0, total_line_items: 0, row_order: 6 },
      { proposal_id: proposal.id, section: "cost", label: "TBD", quantity: 0, items_per_object: 0, total_line_items: 0, row_order: 7 },
      { proposal_id: proposal.id, section: "cost", label: "TBD", quantity: 0, items_per_object: 0, total_line_items: 0, row_order: 8 },
    ];

    // ─── Level 2: fan out every child insert in parallel ───
    const scenarioTypes = ["P1", "P2", "Opt1", "Opt2"];
    const [scenariosRes, bidSheetRes, migrationConfigRes, migrationLinesRes] =
      await Promise.all([
        supabase
          .from("scenarios")
          .insert(
            scenarioTypes.map((type, i) => ({
              proposal_id: proposal.id,
              scenario_type: type,
              is_active: i === 0,
            }))
          )
          .select("id"),
        supabase.from("bid_sheets").insert({
          proposal_id: proposal.id,
          customer_id: validCustomerId || null,
        }),
        supabase.from("migration_config").insert({
          proposal_id: proposal.id,
          doc_avg_mb_per_project: 0,
        }),
        supabase.from("migration_detail_lines").insert(migrationDefaults),
      ]);

    if (scenariosRes.error || !scenariosRes.data) {
      setError(scenariosRes.error?.message ?? "Failed to create scenarios");
      setLoading(false);
      return;
    }
    // Non-critical inserts — log but don't block on failure. The
    // proposal detail page self-heals missing bid_sheets rows.
    if (bidSheetRes.error) console.warn("bid_sheet insert failed", bidSheetRes.error);
    if (migrationConfigRes.error) console.warn("migration_config insert failed", migrationConfigRes.error);
    if (migrationLinesRes.error) console.warn("migration_detail_lines insert failed", migrationLinesRes.error);

    // ─── Level 3: scenario_lines (cross product) ───────────
    if (uniqueModules.length > 0) {
      const lines = scenariosRes.data.flatMap((scenario) =>
        uniqueModules.map((module, idx) => ({
          scenario_id: scenario.id,
          row_order: idx,
          module,
        }))
      );
      if (lines.length > 0) {
        await supabase.from("scenario_lines").insert(lines);
      }
    }

    router.push(`/proposals/${proposal.id}`);
  };

  return (
    <div className="mx-auto max-w-lg">
      <Card>
        <CardHeader>
          <CardTitle>New Proposal</CardTitle>
          <CardDescription>
            Create a new scoping proposal with 4 scenarios
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleCreate}>
          <CardContent className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="name">Proposal Name</Label>
              <Input
                id="name"
                placeholder="e.g., Acme Corp Rapid Rollout"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer">Customer</Label>
              <Select value={customerId} onValueChange={(v) => setCustomerId(v ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a customer">
                    {customers.find((c) => c.id === customerId)?.company_name ?? "Select a customer"}
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
          </CardContent>
          <CardFooter className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !name}>
              {loading ? "Creating..." : "Create Proposal"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
