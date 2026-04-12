"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

const STATUSES = [
  { value: "Draft", variant: "secondary" as const },
  { value: "Proposal Sent", variant: "default" as const },
  { value: "Customer Review", variant: "default" as const },
  { value: "Won", variant: "default" as const },
  { value: "Lost", variant: "destructive" as const },
  { value: "VOID", variant: "destructive" as const },
];

export function ProposalStatus({
  proposalId,
  initialStatus,
}: {
  proposalId: string;
  initialStatus: string;
}) {
  const [status, setStatus] = useState(initialStatus);
  const supabase = createClient();

  const handleChange = async (newStatus: string | null) => {
    if (!newStatus) return;
    setStatus(newStatus);
    await supabase
      .from("proposals")
      .update({ status: newStatus })
      .eq("id", proposalId);
  };

  const current = STATUSES.find((s) => s.value === status);

  return (
    <Select value={status} onValueChange={handleChange}>
      <SelectTrigger className="h-7 w-auto gap-1 border-none bg-transparent p-0 shadow-none">
        <Badge variant={current?.variant ?? "secondary"}>
          {status}
        </Badge>
      </SelectTrigger>
      <SelectContent>
        {STATUSES.map((s) => (
          <SelectItem key={s.value} value={s.value}>
            {s.value}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
