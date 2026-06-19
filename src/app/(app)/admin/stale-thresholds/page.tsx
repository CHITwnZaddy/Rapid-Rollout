import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listStaleThresholds } from "@/lib/settings/sales-ops";
import { STALE_THRESHOLD_STATUSES } from "@/lib/settings/sales-ops-constants";
import { StaleThresholdRow } from "./stale-threshold-row";

export const dynamic = "force-dynamic";

export default async function StaleThresholdsPage() {
  const thresholds = await listStaleThresholds();
  const editableThresholds = STALE_THRESHOLD_STATUSES.map((status) =>
    thresholds.find((threshold) => threshold.status === status)
  ).filter((threshold) => threshold !== undefined);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Stale Thresholds</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Stale aging resets only when the proposal status changes.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Active pipeline statuses</CardTitle>
          <CardDescription>
            On Hold is tracked separately and does not have a stale threshold.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Threshold days</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="w-24">Save</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {editableThresholds.map((threshold) => (
                <StaleThresholdRow key={threshold.id} threshold={threshold} />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
