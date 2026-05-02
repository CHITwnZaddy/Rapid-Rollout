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
import { listVarianceReasons } from "@/lib/settings/sales-ops";
import { updateVarianceReason } from "./actions";

export const dynamic = "force-dynamic";

export default async function VarianceReasonsPage() {
  const reasons = await listVarianceReasons();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Variance Reasons</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Required reasons when Signed LoE value is below the sold price.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Reason list</CardTitle>
          <CardDescription>
            Codes are stable. Managers can edit the labels, descriptions, order,
            and active state.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Sort</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="w-24">Save</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reasons.map((reason) => (
                <TableRow key={reason.id}>
                  <TableCell className="font-mono text-xs">{reason.code}</TableCell>
                  <TableCell>
                    <form
                      id={`variance-reason-${reason.id}`}
                      action={updateVarianceReason}
                    >
                      <input type="hidden" name="id" value={reason.id} />
                      <input type="hidden" name="code" value={reason.code} />
                      <Input
                        name="label"
                        defaultValue={reason.label}
                        aria-label={`${reason.code} label`}
                        className="w-44"
                      />
                    </form>
                  </TableCell>
                  <TableCell>
                    <Input
                      name="description"
                      form={`variance-reason-${reason.id}`}
                      defaultValue={reason.description}
                      aria-label={`${reason.code} description`}
                      className="min-w-80"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      name="sortOrder"
                      form={`variance-reason-${reason.id}`}
                      type="number"
                      min="0"
                      step="1"
                      defaultValue={reason.sort_order}
                      aria-label={`${reason.code} sort order`}
                      className="w-24"
                    />
                  </TableCell>
                  <TableCell>
                    <select
                      name="isActive"
                      form={`variance-reason-${reason.id}`}
                      defaultValue={reason.is_active ? "true" : "false"}
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                      aria-label={`${reason.code} active state`}
                    >
                      <option value="true">Active</option>
                      <option value="false">Inactive</option>
                    </select>
                  </TableCell>
                  <TableCell>
                    <Button size="sm" form={`variance-reason-${reason.id}`}>
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
