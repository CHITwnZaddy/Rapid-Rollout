"use client";

import { useState, useCallback } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface ColumnDef {
  key: string;
  label: string;
  type?: "text" | "number";
  editable?: boolean;
  width?: string;
}

interface AdminDataTableProps {
  tableName: string;
  columns: ColumnDef[];
  initialData: Record<string, unknown>[];
  createDefaults?: Record<string, unknown>;
}

export function AdminDataTable({
  tableName,
  columns,
  initialData,
  createDefaults = {},
}: AdminDataTableProps) {
  // Use untyped client for generic admin table operations
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createBrowserClient<any>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const [data, setData] = useState(initialData);
  const [search, setSearch] = useState("");
  const [editingCell, setEditingCell] = useState<{
    rowId: string;
    key: string;
  } | null>(null);
  const [editValue, setEditValue] = useState("");

  const filtered = data.filter((row) =>
    columns.some((col) =>
      String(row[col.key] ?? "")
        .toLowerCase()
        .includes(search.toLowerCase())
    )
  );

  const startEdit = (rowId: string, key: string, currentValue: unknown) => {
    setEditingCell({ rowId, key });
    setEditValue(String(currentValue ?? ""));
  };

  const saveEdit = useCallback(async () => {
    if (!editingCell) return;
    const { rowId, key } = editingCell;
    const col = columns.find((c) => c.key === key);
    const value = col?.type === "number" ? parseFloat(editValue) || 0 : editValue;

    await supabase
      .from(tableName)
      .update({ [key]: value })
      .eq("id", rowId);

    setData((prev) =>
      prev.map((row) =>
        row.id === rowId ? { ...row, [key]: value } : row
      )
    );
    setEditingCell(null);
  }, [editingCell, editValue, columns, supabase, tableName]);

  const addRow = useCallback(async () => {
    const newRow: Record<string, unknown> = { ...createDefaults };
    for (const col of columns) {
      if (!(col.key in newRow)) {
        newRow[col.key] = col.type === "number" ? 0 : "";
      }
    }

    const { data: inserted } = await supabase
      .from(tableName)
      .insert(newRow)
      .select()
      .single();

    if (inserted) setData((prev) => [...prev, inserted]);
  }, [columns, createDefaults, supabase, tableName]);

  const deleteRow = useCallback(
    async (rowId: string) => {
      await supabase.from(tableName).delete().eq("id", rowId);
      setData((prev) => prev.filter((row) => row.id !== rowId));
    },
    [supabase, tableName]
  );

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-4">
        <Input
          placeholder="Search..."
          className="max-w-sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button onClick={addRow} size="sm">
          Add Row
        </Button>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead key={col.key} style={{ width: col.width }}>
                  {col.label}
                </TableHead>
              ))}
              <TableHead className="w-[80px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((row) => (
              <TableRow key={String(row.id)}>
                {columns.map((col) => {
                  const isEditing =
                    editingCell?.rowId === row.id &&
                    editingCell?.key === col.key;

                  return (
                    <TableCell key={col.key}>
                      {isEditing ? (
                        <Input
                          className="h-7 text-xs"
                          type={col.type === "number" ? "number" : "text"}
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={saveEdit}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveEdit();
                            if (e.key === "Escape") setEditingCell(null);
                          }}
                          autoFocus
                        />
                      ) : (
                        <span
                          className={
                            col.editable !== false
                              ? "cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1"
                              : ""
                          }
                          onDoubleClick={() => {
                            if (col.editable !== false)
                              startEdit(
                                String(row.id),
                                col.key,
                                row[col.key]
                              );
                          }}
                        >
                          {col.type === "number"
                            ? Number(row[col.key]).toLocaleString()
                            : String(row[col.key] ?? "")}
                        </span>
                      )}
                    </TableCell>
                  );
                })}
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-destructive"
                    onClick={() => deleteRow(String(row.id))}
                  >
                    Delete
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={columns.length + 1}
                  className="py-8 text-center text-muted-foreground"
                >
                  {search ? "No matching rows" : "No data. Click 'Add Row' to start."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {filtered.length} row{filtered.length !== 1 ? "s" : ""} &middot;
        Double-click a cell to edit
      </p>
    </div>
  );
}
