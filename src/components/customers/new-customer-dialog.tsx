"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { newCustomerSchema } from "@/lib/validation/customer";
import { createCustomer } from "@/app/(app)/customers/actions";
import { toast } from "sonner";

const EMPTY_FORM = {
  company_name: "",
  address_line1: "",
  address_line2: "",
  city: "",
  state: "",
  zip: "",
};

// Inline "add a customer without leaving this screen" dialog. Used on
// the New Proposal page so SEs don't have to detour through /customers.
export function NewCustomerDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (customer: { id: string; company_name: string }) => void;
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const setField = (field: keyof typeof EMPTY_FORM) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = newCustomerSchema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid customer input.");
      return;
    }

    setSaving(true);
    const result = await createCustomer(parsed.data);
    setSaving(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success(`Customer "${result.customer.company_name}" created.`);
    setForm(EMPTY_FORM);
    onCreated(result.customer);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Customer</DialogTitle>
          <DialogDescription>
            Add a customer without leaving this screen. Address fields are
            optional and can be filled in later on the Customers page.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-customer-name">Company Name</Label>
            <Input
              id="new-customer-name"
              value={form.company_name}
              onChange={setField("company_name")}
              placeholder="e.g., City of Edmond"
              required
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-customer-address1">Address Line 1</Label>
            <Input
              id="new-customer-address1"
              value={form.address_line1}
              onChange={setField("address_line1")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-customer-address2">Address Line 2</Label>
            <Input
              id="new-customer-address2"
              value={form.address_line2}
              onChange={setField("address_line2")}
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-2">
              <Label htmlFor="new-customer-city">City</Label>
              <Input
                id="new-customer-city"
                value={form.city}
                onChange={setField("city")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-customer-state">State</Label>
              <Input
                id="new-customer-state"
                value={form.state}
                onChange={setField("state")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-customer-zip">Zip</Label>
              <Input
                id="new-customer-zip"
                value={form.zip}
                onChange={setField("zip")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !form.company_name.trim()}>
              {saving ? "Creating..." : "Create Customer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
