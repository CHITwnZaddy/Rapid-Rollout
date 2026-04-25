"use client";

import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useMigrationConfig } from "@/lib/hooks/use-migration-config";
import { MigrationConfigForm } from "@/components/migration/migration-config-form";
import { MigrationTotalsSummary } from "@/components/migration/migration-totals-summary";
import { MigrationDetailSection } from "@/components/migration/migration-detail-section";

export default function MigrationPage() {
  const { id: proposalId } = useParams<{ id: string }>();

  const {
    config,
    rateError,
    loadError,
    saveError,
    saveStatus,
    loading,
    totals,
    numProjects,
    projectLines,
    workflowLines,
    costLines,
    isMutatingRows,
    mutatingSection,
    removingLineId,
    updateConfig,
    updateLine,
    addLine,
    removeLine,
    retryPendingSaves,
    clearSaveError,
    retry,
  } = useMigrationConfig(proposalId);

  if (loading) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        Loading migration services...
      </div>
    );
  }

  if (rateError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Unable to load pricing data</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Migration services cannot be priced until the rate card loads.
            To prevent a stale default from silently mis-pricing a deal,
            this page has been blocked from saving or rendering totals.
          </p>
          <p className="font-mono text-xs text-destructive">{rateError}</p>
          <Button onClick={retry}>Retry</Button>
        </CardContent>
      </Card>
    );
  }

  if (loadError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Migration Services Unavailable</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>{loadError}</p>
          <p>
            This page no longer auto-creates missing migration records because
            that can hide underlying data problems.
          </p>
          <Button onClick={retry}>Retry</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {(saveStatus !== "idle" || saveError) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Migration Save Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            {saveStatus === "saving" && (
              <p>Saving migration changes...</p>
            )}
            {saveStatus === "saved" && !saveError && (
              <p>All migration changes are saved.</p>
            )}
            {saveError && (
              <>
                <p className="text-destructive">
                  {saveError}
                </p>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => void retryPendingSaves()}>
                    Retry Save
                  </Button>
                  <Button size="sm" variant="outline" onClick={clearSaveError}>
                    Dismiss
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
      <MigrationConfigForm config={config} totals={totals} onUpdate={updateConfig} />
      <MigrationDetailSection
        title="Project & Schedule Data Migration"
        section="project"
        lines={projectLines}
        config={config}
        numProjectsOverride={numProjects}
        complexityFactor={Number(config?.complexity_factor ?? 1)}
        qtyLabel="# of Projects"
        itemsLabel="Line Items / Object"
        totalEditable={false}
        labelEditable={(row) =>
          row.label !== "Project Info/Detail" && row.label !== "Schedules"
        }
        isMutatingRows={isMutatingRows}
        mutatingSection={mutatingSection}
        removingLineId={removingLineId}
        onUpdateLine={updateLine}
        onAddLine={addLine}
        onRemoveLine={removeLine}
      />
      <MigrationDetailSection
        title="Workflow Data Migration"
        section="workflow"
        lines={workflowLines}
        config={config}
        complexityFactor={Number(config?.complexity_factor ?? 1)}
        qtyLabel="# of Instances"
        itemsLabel="Line Items / Object"
        totalEditable={false}
        labelEditable
        isMutatingRows={isMutatingRows}
        mutatingSection={mutatingSection}
        removingLineId={removingLineId}
        onUpdateLine={updateLine}
        onAddLine={addLine}
        onRemoveLine={removeLine}
      />
      <MigrationDetailSection
        title="Cost Data Migration"
        section="cost"
        lines={costLines}
        config={config}
        complexityFactor={Number(config?.complexity_factor ?? 1)}
        qtyLabel="Avg / Project"
        itemsLabel="Line Items / Object"
        totalEditable={false}
        labelEditable
        isMutatingRows={isMutatingRows}
        mutatingSection={mutatingSection}
        removingLineId={removingLineId}
        onUpdateLine={updateLine}
        onAddLine={addLine}
        onRemoveLine={removeLine}
      />
      <MigrationTotalsSummary
        config={config}
        totals={totals}
        onUpdate={updateConfig}
      />
    </div>
  );
}
