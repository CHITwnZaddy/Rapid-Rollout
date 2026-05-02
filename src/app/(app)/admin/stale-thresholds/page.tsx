import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listStaleThresholds } from "@/lib/settings/sales-ops";
import { STALE_THRESHOLD_STATUSES } from "@/lib/settings/sales-ops-constants";
import { submitUpdateStaleThreshold } from "./actions";

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
                <TableRow key={threshold.id}>
                  <TableCell className="font-medium">{threshold.status}</TableCell>
                  <TableCell>
                    <form
                      id={`stale-threshold-${threshold.id}`}
                      action={submitUpdateStaleThreshold}
                    >
                      <input type="hidden" name="id" value={threshold.id} />
                      <input type="hidden" name="status" value={threshold.status} />
                      <Input
                        name="thresholdDays"
                        type="number"
                        min="1"
                        step="1"
                        defaultValue={threshold.threshold_days}
                        aria-label={`${threshold.status} stale threshold days`}
                        className="w-32"
                      />
                    </form>
                  </TableCell>
                  <TableCell>
                    <select
                      name="isActive"
                      form={`stale-threshold-${threshold.id}`}
                      defaultValue={threshold.is_active ? "true" : "false"}
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                      aria-label={`${threshold.status} active state`}
                    >
                      <option value="true">Active</option>
                      <option value="false">Inactive</option>
                    </select>
                  </TableCell>
                  <TableCell>
                    <Button size="sm" form={`stale-threshold-${threshold.id}`}>
                      Save
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
