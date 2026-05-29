import { ConfirmSubmitButton } from "@/components/admin/confirm-submit-button";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/calculations/engine";
import {
  listKpiUserTargets,
  listKpiYearTargets,
  listSettingsUsers,
} from "@/lib/settings/sales-ops";
import {
  submitDeleteKpiUserTarget,
  submitDeleteKpiYearTarget,
  submitUpdateKpiYearTarget,
  submitUpsertKpiUserTarget,
} from "./actions";

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
                <TableRow key={target.id}>
                  <TableCell className="font-medium">{target.year}</TableCell>
                  <TableCell>{target.label}</TableCell>
                  <TableCell>
                    <form
                      id={`year-target-${target.id}`}
                      action={submitUpdateKpiYearTarget}
                      className="flex items-center gap-2"
                    >
                      <input type="hidden" name="id" value={target.id} />
                      <input type="hidden" name="year" value={target.year} />
                      <input type="hidden" name="label" value={target.label} />
                      <Input
                        name="teamQuota"
                        type="number"
                        min="0"
                        step="1000"
                        defaultValue={target.team_quota}
                        aria-label={`${target.label} team quota`}
                        className="w-40"
                      />
                    </form>
                  </TableCell>
                  <TableCell>
                    <select
                      name="isActive"
                      form={`year-target-${target.id}`}
                      defaultValue={target.is_active ? "true" : "false"}
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                      aria-label={`${target.label} active state`}
                    >
                      <option value="true">Active</option>
                      <option value="false">Inactive</option>
                    </select>
                  </TableCell>
                  <TableCell>
                    <form
                      id={`delete-year-target-${target.id}`}
                      action={submitDeleteKpiYearTarget}
                    >
                      <input type="hidden" name="id" value={target.id} />
                    </form>
                    <div className="flex gap-2">
                      <Button
                        type="submit"
                        size="sm"
                        form={`year-target-${target.id}`}
                      >
                        Save
                      </Button>
                      <ConfirmSubmitButton
                        form={`delete-year-target-${target.id}`}
                        message={`Delete ${target.label}? This also deletes SE targets tied to ${target.year}.`}
                      >
                        Delete
                      </ConfirmSubmitButton>
                    </div>
                  </TableCell>
                </TableRow>
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
          <form
            action={submitUpsertKpiUserTarget}
            className="grid gap-4 rounded-md border p-4 md:grid-cols-[1fr_120px_160px_120px_auto]"
          >
            <div className="space-y-2">
              <Label htmlFor="new-user-target-user">SE</Label>
              <select
                id="new-user-target-user"
                name="userId"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                required
              >
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.email}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-user-target-year">Year</Label>
              <select
                id="new-user-target-year"
                name="year"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                required
              >
                {activeYears.map((target) => (
                  <option key={target.year} value={target.year}>
                    {target.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-user-target-amount">Target</Label>
              <Input
                id="new-user-target-amount"
                name="targetAmount"
                type="number"
                min="0"
                step="1000"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-user-target-active">Active</Label>
              <select
                id="new-user-target-active"
                name="isActive"
                defaultValue="true"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>
            <div className="flex items-end">
              <Button type="submit">Save</Button>
            </div>
          </form>

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
                  const user = users.find((candidate) => candidate.id === target.user_id);
                  const year = yearTargets.find(
                    (candidate) => candidate.year === target.year
                  );
                  const formId = `user-target-${target.id}`;
                  const deleteFormId = `delete-user-target-${target.id}`;

                  return (
                    <TableRow key={target.id}>
                      <TableCell>{user?.email ?? target.user_id}</TableCell>
                      <TableCell>{year?.label ?? target.year}</TableCell>
                      <TableCell>
                        <form action={submitUpsertKpiUserTarget} id={formId}>
                          <input type="hidden" name="id" value={target.id} />
                          <input type="hidden" name="year" value={target.year} />
                          <input type="hidden" name="userId" value={target.user_id} />
                          <Input
                            name="targetAmount"
                            type="number"
                            min="0"
                            step="1000"
                            defaultValue={target.target_amount}
                            aria-label={`${user?.email ?? target.user_id} target amount`}
                            className="w-40"
                          />
                        </form>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatCurrency(target.target_amount)}
                        </p>
                      </TableCell>
                      <TableCell>
                        <select
                          name="isActive"
                          form={formId}
                          defaultValue={target.is_active ? "true" : "false"}
                          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                          aria-label={`${user?.email ?? target.user_id} active state`}
                        >
                          <option value="true">Active</option>
                          <option value="false">Inactive</option>
                        </select>
                      </TableCell>
                      <TableCell>
                        <form action={submitDeleteKpiUserTarget} id={deleteFormId}>
                          <input type="hidden" name="id" value={target.id} />
                        </form>
                        <div className="flex gap-2">
                          <Button type="submit" size="sm" form={formId}>
                            Save
                          </Button>
                          <ConfirmSubmitButton
                            form={deleteFormId}
                            message={`Delete ${user?.email ?? target.user_id} target for ${year?.label ?? target.year}?`}
                          >
                            Delete
                          </ConfirmSubmitButton>
                        </div>
                      </TableCell>
                    </TableRow>
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
