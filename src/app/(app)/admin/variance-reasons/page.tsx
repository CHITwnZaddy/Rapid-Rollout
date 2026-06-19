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
import { listVarianceReasons } from "@/lib/settings/sales-ops";
import { VarianceReasonRow } from "./variance-reason-row";

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
                <VarianceReasonRow key={reason.id} reason={reason} />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
