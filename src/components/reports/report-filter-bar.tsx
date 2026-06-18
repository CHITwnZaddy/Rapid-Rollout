"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ─────────────────────────────────────────────────────────────
// Config-driven filter bar shared by all reports. Each report
// declares its filters as specs; values live in the page (or the
// useReportState hook) so the bar stays a controlled component.
// Specs are JSON-serializable on purpose — see report-config.ts.
// ─────────────────────────────────────────────────────────────

export type FilterOption = { label: string; value: string };

export type FilterSpec =
  | {
      kind: "select";
      key: string;
      label: string;
      options: FilterOption[];
      widthClass?: string;
    }
  | {
      kind: "checkbox";
      key: string;
      label: string;
    }
  | {
      kind: "date";
      key: string;
      label: string;
      widthClass?: string;
    };

export type FilterValues = Record<string, string | boolean>;

export function ReportFilterBar({
  specs,
  values,
  onChange,
  onRun,
  onExport,
  loading,
  runDisabled = false,
  canExport,
}: {
  specs: FilterSpec[];
  values: FilterValues;
  onChange: (key: string, value: string | boolean) => void;
  onRun: () => void;
  onExport?: () => void;
  loading: boolean;
  runDisabled?: boolean;
  canExport: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Filters</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-end gap-4">
          {specs.map((spec) =>
            spec.kind === "select" ? (
              <div key={spec.key} className="space-y-1">
                <Label className="text-xs" htmlFor={`filter-${spec.key}`}>
                  {spec.label}
                </Label>
                <Select
                  value={String(values[spec.key] ?? "")}
                  onValueChange={(v) => {
                    if (v !== null && v !== undefined) onChange(spec.key, v);
                  }}
                >
                  <SelectTrigger
                    id={`filter-${spec.key}`}
                    aria-label={spec.label}
                    className={`h-8 ${spec.widthClass ?? "w-[200px]"}`}
                  >
                    <SelectValue>
                      {spec.options.find(
                        (o) => o.value === String(values[spec.key] ?? "")
                      )?.label ?? ""}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {spec.options.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : spec.kind === "date" ? (
              <div key={spec.key} className="space-y-1">
                <Label className="text-xs" htmlFor={`filter-${spec.key}`}>
                  {spec.label}
                </Label>
                <Input
                  id={`filter-${spec.key}`}
                  type="date"
                  value={String(values[spec.key] ?? "")}
                  onChange={(e) => onChange(spec.key, e.target.value)}
                  className={`h-8 ${spec.widthClass ?? "w-[160px]"}`}
                />
              </div>
            ) : (
              <label
                key={spec.key}
                className="flex items-center gap-2 pb-1.5 text-sm"
              >
                <input
                  type="checkbox"
                  checked={Boolean(values[spec.key])}
                  onChange={(e) => onChange(spec.key, e.target.checked)}
                  className="h-4 w-4"
                />
                {spec.label}
              </label>
            )
          )}
          <Button
            size="sm"
            onClick={onRun}
            disabled={loading || runDisabled}
            aria-busy={loading}
          >
            {loading ? "Running..." : "Run Report"}
          </Button>
          {canExport && onExport && (
            <Button size="sm" variant="outline" onClick={onExport}>
              Export XLSX
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
