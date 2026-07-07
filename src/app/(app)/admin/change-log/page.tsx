// Change log is read-only audit data; a short cache window is fine
// for admin review use.
export const revalidate = 10;

import { createClient } from "@/lib/supabase/server";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { z } from "zod";
import { safeParseSupabaseResult } from "@/lib/validation/parse-supabase";

// old_values/new_values are jsonb audit snapshots the trigger always writes as
// objects; a record schema keeps the keyed lookups below type-safe.
const LogEntrySchema = z.object({
  id: z.string(),
  table_name: z.string(),
  action: z.string(),
  record_id: z.string(),
  created_at: z.string().nullable(),
  old_values: z.record(z.string(), z.unknown()).nullable(),
  new_values: z.record(z.string(), z.unknown()).nullable(),
});

export default async function ChangeLogPage() {
  const supabase = await createClient();
  const result = await supabase
    .from("change_log")
    .select("id, table_name, action, record_id, created_at, old_values, new_values")
    .order("created_at", { ascending: false })
    .limit(100);
  const parsed = safeParseSupabaseResult(z.array(LogEntrySchema), result);
  const logs = parsed.ok ? parsed.data : null;
  const loadError = parsed.ok ? null : parsed.error;

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Change Log</h1>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Table</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Proposal / Record</TableHead>
              <TableHead>Justification / Details</TableHead>
              <TableHead>Deleted By</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loadError && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-8 text-center text-muted-foreground"
                >
                  Unable to load the change log. Refresh to retry.
                </TableCell>
              </TableRow>
            )}
            {!loadError && (!logs || logs.length === 0) && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-8 text-center text-muted-foreground"
                >
                  No changes recorded yet.
                </TableCell>
              </TableRow>
            )}
            {logs?.map((log) => {
              const proposalName =
                typeof log.old_values?.name === "string"
                  ? log.old_values.name
                  : null;
              const proposalStatus =
                typeof log.old_values?.status === "string"
                  ? log.old_values.status
                  : null;
              const justification =
                typeof log.new_values?.justification === "string"
                  ? log.new_values.justification
                  : null;
              const deletedByEmail =
                typeof log.new_values?.deleted_by_email === "string"
                  ? log.new_values.deleted_by_email
                  : null;

              return (
                <TableRow key={log.id}>
                  <TableCell className="text-sm whitespace-nowrap">
                    {log.created_at
                      ? new Date(log.created_at).toLocaleString()
                      : "—"}
                  </TableCell>
                  <TableCell>{log.table_name}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        log.action === "DELETE" ? "destructive" : "secondary"
                      }
                    >
                      {log.action}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {proposalName ? (
                      <div>
                        <p className="font-medium">{proposalName}</p>
                        {proposalStatus && (
                          <p className="text-xs text-muted-foreground">
                            Status at deletion: {proposalStatus}
                          </p>
                        )}
                      </div>
                    ) : (
                      <span className="font-mono text-xs text-muted-foreground">
                        {log.record_id}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-xs">
                    {justification ? (
                      <p className="text-sm">{justification}</p>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {deletedByEmail ?? (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
