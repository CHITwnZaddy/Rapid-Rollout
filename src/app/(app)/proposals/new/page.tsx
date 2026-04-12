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
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("You must be logged in.");
      setLoading(false);
      return;
    }

    // Create proposal
    const { data: proposal, error: proposalError } = await supabase
      .from("proposals")
      .insert({
        name,
        customer_id: customerId || null,
        created_by: user.id,
      })
      .select()
      .single();

    if (proposalError || !proposal) {
      setError(proposalError?.message ?? "Failed to create proposal");
      setLoading(false);
      return;
    }

    // Create 4 scenario shells
    const scenarioTypes = ["P1", "P2", "Opt1", "Opt2"];
    const { error: scenarioError } = await supabase.from("scenarios").insert(
      scenarioTypes.map((type, i) => ({
        proposal_id: proposal.id,
        scenario_type: type,
        is_active: i === 0, // P1 is active by default
      }))
    );

    if (scenarioError) {
      setError(scenarioError.message);
      setLoading(false);
      return;
    }

    // Get all active service modules to pre-populate scenario lines
    const { data: services } = await supabase
      .from("service_hours")
      .select("service_name, service_group")
      .eq("status", "Active")
      .order("service_name");

    if (services) {
      // Get unique module names preserving order
      const uniqueModules: string[] = [];
      const seen = new Set<string>();
      for (const s of services) {
        if (!seen.has(s.service_name)) {
          seen.add(s.service_name);
          uniqueModules.push(s.service_name);
        }
      }

      // Get scenario IDs we just created
      const { data: scenarios } = await supabase
        .from("scenarios")
        .select("id")
        .eq("proposal_id", proposal.id);

      if (scenarios) {
        const lines = scenarios.flatMap((scenario) =>
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
    }

    // Create empty bid sheet
    await supabase.from("bid_sheets").insert({
      proposal_id: proposal.id,
      customer_id: customerId || null,
    });

    // Create migration config with defaults (doc_avg_mb_per_project starts at 0)
    await supabase.from("migration_config").insert({
      proposal_id: proposal.id,
      doc_avg_mb_per_project: 0,
    });

    // Create default migration detail lines
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
    await supabase.from("migration_detail_lines").insert(migrationDefaults);

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
