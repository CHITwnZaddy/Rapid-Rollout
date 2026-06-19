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
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  listKpiUserTargets,
  listKpiYearTargets,
  listSettingsUsers,
} from "@/lib/settings/sales-ops";
import { KpiUserTargetCreateForm } from "./kpi-user-target-create-form";
import { KpiUserTargetRow } from "./kpi-user-target-row";
import { KpiYearTargetRow } from "./kpi-year-target-row";

export const dynamic = "force-dynamic";

export default async function KpiTargetsPage() {
  const [yearTargets, userTargets, users] = await Promise.all([
    listKpiYearTargets(),
    listKpiUserTargets(),
    listSettingsUsers(),
  ]);

  const activeYears = yearTargets.filter((target) => target.is_active);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">KPI Targets</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Calendar-year targets for team quota and individual SE targets.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Team quota</CardTitle>
          <CardDescription>
            FY labels are display-only. Calendar year drives reporting math.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Year</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Team quota</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="w-40">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {yearTargets.map((target) => (
                <KpiYearTargetRow key={target.id} target={target} />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>SE targets</CardTitle>
          <CardDescription>
            The manager owns these targets for planning and quota visibility.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <KpiUserTargetCreateForm users={users} activeYears={activeYears} />

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SE</TableHead>
                <TableHead>Year</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="w-40">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {userTargets.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-8 text-center text-muted-foreground"
                  >
                    No SE targets saved yet.
                  </TableCell>
                </TableRow>
              ) : (
                userTargets.map((target) => {
                  const user = users.find(
                    (candidate) => candidate.id === target.user_id
                  );
                  const year = yearTargets.find(
                    (candidate) => candidate.year === target.year
                  );
                  return (
                    <KpiUserTargetRow
                      key={target.id}
                      target={target}
                      userEmail={user?.email ?? target.user_id}
                      yearLabel={year?.label ?? String(target.year)}
                    />
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
