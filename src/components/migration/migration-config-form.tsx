"use client";

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
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { type DbConfig } from "@/lib/hooks/use-migration-config";
import { type MigrationTotals } from "@/lib/calculations/migration-engine";

const NUM = (v: unknown) => Number(v) || 0;

interface MigrationConfigFormProps {
  config: DbConfig | null;
  totals: MigrationTotals | null;
  onUpdate: (field: keyof DbConfig, value: number | boolean | string) => void;
}

export function MigrationConfigForm({
  config,
  totals,
  onUpdate,
}: MigrationConfigFormProps) {
  return (
    <>
      {/* ── Configuration ─────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Migration Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs">Number of Projects</Label>
              <Input
                type="number"
                min={0}
                className="h-8"
                value={config?.num_projects ?? 0}
                onChange={(e) =>
                  onUpdate("num_projects", parseInt(e.target.value) || 0)
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Hrs / Standard Import</Label>
              <Input
                type="number"
                min={0}
                step={0.25}
                className="h-8"
                value={config?.hrs_per_import ?? 0.75}
                onChange={(e) =>
                  onUpdate("hrs_per_import", parseFloat(e.target.value) || 0)
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs"># of Lines / Import File</Label>
              <Input
                type="number"
                min={1}
                className="h-8"
                value={config?.lines_per_import_file ?? 2550}
                onChange={(e) =>
                  onUpdate(
                    "lines_per_import_file",
                    parseInt(e.target.value) || 2550
                  )
                }
              />
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs">
                Is Data Migration Effort Included?
              </Label>
              <Select
                value={config?.is_effort_included ? "Yes" : "No"}
                onValueChange={(v) =>
                  onUpdate("is_effort_included", v === "Yes")
                }
              >
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Yes">Yes</SelectItem>
                  <SelectItem value="No">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">
                Is Data Migration Workshop Included?
              </Label>
              <Select
                value={config?.is_workshop_included ? "Yes" : "No"}
                onValueChange={(v) =>
                  onUpdate("is_workshop_included", v === "Yes")
                }
              >
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Yes">Yes</SelectItem>
                  <SelectItem value="No">No</SelectItem>
                </SelectContent>
              </Select>
              {config?.is_effort_included && config?.is_workshop_included && (
                <p className="text-xs text-destructive">
                  Both cannot be set to Yes
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">PM Contingency %</Label>
              <Input
                type="number"
                min={0}
                max={100}
                step={1}
                className="h-8"
                value={Math.round(NUM(config?.pm_contingency_pct) * 100)}
                onChange={(e) =>
                  onUpdate(
                    "pm_contingency_pct",
                    (parseFloat(e.target.value) || 0) / 100
                  )
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Core Efforts (when effort = Yes) ──────────────────────── */}
      {config?.is_effort_included && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Core Data Migration Efforts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-5">
              {[
                { label: "Requirements", field: "core_requirements_hrs" as const },
                { label: "Migration Plan", field: "core_migration_plan_hrs" as const },
                { label: "Plan Validation/QA", field: "core_validation_hrs" as const },
                { label: "Final Q/A", field: "core_final_qa_hrs" as const },
                { label: "PM Oversight", field: "core_pm_oversight_hrs" as const },
              ].map(({ label, field }) => (
                <div key={field} className="space-y-1">
                  <Label className="text-xs">{label}</Label>
                  <Input
                    type="number"
                    min={0}
                    className="h-8"
                    value={NUM(config?.[field])}
                    onChange={(e) =>
                      onUpdate(field, parseFloat(e.target.value) || 0)
                    }
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Document Migration ────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Document Migration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs">Avg MB / Project</Label>
              <Input
                type="number"
                min={0}
                className="h-8"
                value={NUM(config?.doc_avg_mb_per_project)}
                onChange={(e) =>
                  onUpdate(
                    "doc_avg_mb_per_project",
                    parseFloat(e.target.value) || 0
                  )
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">MB / Hour</Label>
              <div className="flex h-8 items-center rounded-md border bg-muted px-3 text-sm tabular-nums">
                {NUM(config?.doc_mb_per_hour).toLocaleString()}
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Calculated Hours</Label>
              <div className="flex h-8 items-center rounded-md bg-muted px-3 text-sm font-medium tabular-nums">
                {(totals?.documentRaw ?? 0).toFixed(1)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
