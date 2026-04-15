// Phase 2.7 — change log is read-only audit data; a 10-second
// window of staleness is fine for admin review use.
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

interface LogEntry {
  id: string;
  table_name: string;
  action: string;
  record_id: string;
  created_at: string;
}

export default async function ChangeLogPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("change_log")
    .select("id, table_name, action, record_id, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  const logs = data as LogEntry[] | null;

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
              <TableHead>Record ID</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(!logs || logs.length === 0) && (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="py-8 text-center text-muted-foreground"
                >
                  No changes recorded yet.
                </TableCell>
              </TableRow>
            )}
            {logs?.map((log) => (
              <TableRow key={log.id}>
                <TableCell className="text-sm">
                  {new Date(log.created_at).toLocaleString()}
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
                <TableCell className="font-mono text-xs">
                  {log.record_id}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
