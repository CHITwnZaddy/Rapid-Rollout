"use client";

import { useState, useEffect, useCallback } from "react";
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
import { createProposal } from "./actions";
import { NewCustomerDialog } from "@/components/customers/new-customer-dialog";

type Customer = {
  id: string;
  company_name: string;
};

export default function NewProposalPage() {
  const [name, setName] = useState("");
  const [customerId, setCustomerId] = useState<string>("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customerLoadError, setCustomerLoadError] = useState(false);
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  // Inline customer creation: drop the new customer into the list
  // (keeping alphabetical order) and select it immediately.
  const handleCustomerCreated = (customer: Customer) => {
    setCustomers((prev) =>
      [...prev, customer].sort((a, b) =>
        a.company_name.localeCompare(b.company_name)
      )
    );
    setCustomerId(customer.id);
  };

  const loadCustomers = useCallback(async () => {
    setCustomerLoadError(false);
    try {
      const { data, error } = await supabase
        .from("customers")
        .select("id, company_name")
        .order("company_name");
      if (error) throw error;
      if (data) setCustomers(data);
    } catch {
      setCustomerLoadError(true);
      toast.error("Could not load customers. Check your connection and retry.");
    }
  }, [supabase]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

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

    const result = await createProposal({
      name: validName,
      customerId: validCustomerId,
    });

    if (!result.ok) {
      setError(result.error);
      toast.error(result.error);
      setLoading(false);
      return;
    }

    router.push(`/proposals/${result.proposalId}`);
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
              {customerLoadError ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-destructive">Failed to load customers.</span>
                  <Button type="button" size="sm" variant="outline" onClick={loadCustomers}>
                    Retry
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Select value={customerId} onValueChange={(v) => setCustomerId(v ?? "")}>
                    <SelectTrigger className="flex-1">
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
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setCustomerDialogOpen(true)}
                  >
                    + New Customer
                  </Button>
                </div>
              )}
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
      <NewCustomerDialog
        open={customerDialogOpen}
        onOpenChange={setCustomerDialogOpen}
        onCreated={handleCustomerCreated}
      />
    </div>
  );
}
