"use client";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useScenarioBreakout } from "@/lib/hooks/use-scenario-breakout";
import { ScenarioBreakoutResults } from "@/components/reports/scenario-breakout-results";

export default function ScenarioBreakoutReport() {
  const {
    proposals,
    selectedProposal,
    setSelectedProposal,
    scenarioGroups,
    scopedLines,
    migrationBreakdownRows,
    rateError,
    loading,
    hasRun,
    ratesReady,
    runReport,
    exportXLSX,
    retryRates,
  } = useScenarioBreakout();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Scenario Breakout Report</h1>

      {rateError && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Unable to load pricing data</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              This report depends on the rate card table. To prevent stale
              defaults from mis-pricing a deal, the report has been blocked
              until rates load successfully.
            </p>
            <p className="font-mono text-xs text-destructive">{rateError}</p>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Select Proposal</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Proposal</Label>
              <Select
                value={selectedProposal}
                onValueChange={(v) => setSelectedProposal(v ?? "")}
              >
                <SelectTrigger className="h-8 w-[300px]">
                  <SelectValue placeholder="Select a proposal">
                    {proposals.find((p) => p.id === selectedProposal)?.name ??
                      "Select a proposal"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {proposals.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              size="sm"
              onClick={runReport}
              disabled={loading || !selectedProposal || !ratesReady}
            >
              {loading ? "Running..." : "Run Report"}
            </Button>
            {rateError && (
              <Button
                size="sm"
                variant="outline"
                onClick={retryRates}
              >
                Retry loading rates
              </Button>
            )}
            {hasRun && scenarioGroups.length > 0 && (
              <Button size="sm" variant="outline" onClick={exportXLSX}>
                Export XLSX
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {hasRun && (
        <ScenarioBreakoutResults
          scenarioGroups={scenarioGroups}
          scopedLines={scopedLines}
          migrationRows={migrationBreakdownRows}
        />
      )}
    </div>
  );
}
