"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { renameProposal } from "@/app/(app)/proposals/[id]/actions";

const MAX_NAME_LENGTH = 200;

interface EditableProposalNameProps {
  proposalId: string;
  initialName: string;
}

export function EditableProposalName({
  proposalId,
  initialName,
}: EditableProposalNameProps) {
  const [name, setName] = useState(initialName);
  const [draft, setDraft] = useState(initialName);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  function startEditing() {
    setDraft(name);
    setEditing(true);
  }

  function cancel() {
    setDraft(name);
    setEditing(false);
  }

  async function save() {
    const trimmed = draft.trim();
    if (trimmed.length === 0) {
      toast.error("Proposal name is required.");
      return;
    }
    // No-op rename: skip the round trip and just close the editor.
    if (trimmed === name) {
      setEditing(false);
      return;
    }

    setSaving(true);
    const result = await renameProposal(proposalId, trimmed);
    if (!result.ok) {
      toast.error(result.error);
      setSaving(false);
      return;
    }

    setName(result.name);
    setEditing(false);
    setSaving(false);
    toast.success("Proposal renamed.");
    router.refresh();
  }

  if (!editing) {
    return (
      <div className="group flex items-center gap-2">
        <h1 className="text-2xl font-bold">{name}</h1>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
          onClick={startEditing}
          aria-label="Rename proposal"
        >
          <Pencil className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        className="h-auto py-1 text-2xl font-bold"
        autoFocus
        maxLength={MAX_NAME_LENGTH}
        disabled={saving}
        aria-label="Proposal name"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void save();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
      />
      <Button
        size="icon"
        className="h-8 w-8"
        onClick={() => void save()}
        disabled={saving}
        aria-label="Save proposal name"
      >
        <Check className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={cancel}
        disabled={saving}
        aria-label="Cancel rename"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
