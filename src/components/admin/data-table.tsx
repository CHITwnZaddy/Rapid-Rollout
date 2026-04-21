"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
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
import {
  buildNewRow,
  normalizeEditableValue,
  type ColumnDef,
} from "./data-table-utils";
export type { ColumnDef } from "./data-table-utils";

type AdminTableName = "customers" | "rate_cards" | "service_hours";
export type AdminRow = Record<string, unknown> & { id: string };
type ActiveCell = { rowId: string; key: string };

type AdminDataTableProps = {
  tableName: AdminTableName;
  columns: ColumnDef[];
  initialData: AdminRow[];
  createDefaults?: Record<string, unknown>;
};

export function AdminDataTable({
  tableName,
  columns,
  initialData,
  createDefaults = {},
}: AdminDataTableProps) {
  const supabase = createClient();
  const [data, setData] = useState(initialData);
  const [search, setSearch] = useState("");
  const [editingCell, setEditingCell] = useState<ActiveCell | null>(null);
  const [editValue, setEditValue] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [savingCell, setSavingCell] = useState<ActiveCell | null>(null);
  const [deletingRowId, setDeletingRowId] = useState<string | null>(null);

  const filtered = data.filter((row) =>
    columns.some((column) =>
      String(row[column.key] ?? "")
        .toLowerCase()
        .includes(search.toLowerCase())
    )
  );

  const startEdit = (rowId: string, key: string, currentValue: unknown) => {
    setEditingCell({ rowId, key });
    setEditValue(String(currentValue ?? ""));
  };

  const saveEdit = useCallback(async () => {
    if (!editingCell || savingCell) return;

    const { rowId, key } = editingCell;
    const column = columns.find((candidate) => candidate.key === key);
    if (!column) {
      toast.error("Couldn't save that field because its column is missing.");
      return;
    }

    const parsed = normalizeEditableValue(editValue, column);
    if (!parsed.ok) {
      toast.error(parsed.error);
      return;
    }

    setSavingCell({ rowId, key });
    const { error } = await supabase
      .from(tableName)
      .update({ [key]: parsed.value } as never)
      .eq("id", rowId);
    setSavingCell(null);

    if (error) {
      toast.error(`Couldn't save ${column.label}. ${error.message}`);
      return;
    }

    setData((previous) =>
      previous.map((row) =>
        row.id === rowId ? { ...row, [key]: parsed.value } : row
      )
    );
    setEditingCell(null);
  }, [columns, editValue, editingCell, savingCell, supabase, tableName]);

  const addRow = useCallback(async () => {
    setIsAdding(true);
    const newRow = buildNewRow(columns, createDefaults, Date.now());
    const { data: inserted, error } = await supabase
      .from(tableName)
      .insert(newRow as never)
      .select()
      .single();
    setIsAdding(false);

    if (error || !inserted) {
      toast.error(`Couldn't add row. ${error?.message ?? "No row was returned."}`);
      return;
    }

    setData((previous) => [...previous, inserted as AdminRow]);
    toast.success("Row added.");
  }, [columns, createDefaults, supabase, tableName]);

  const deleteRow = useCallback(
    async (rowId: string) => {
      setDeletingRowId(rowId);
      const { error } = await supabase.from(tableName).delete().eq("id", rowId);
      setDeletingRowId(null);

      if (error) {
        toast.error(`Couldn't delete row. ${error.message}`);
        return;
      }

      setData((previous) => previous.filter((row) => row.id !== rowId));
      if (editingCell?.rowId === rowId) {
        setEditingCell(null);
      }
      toast.success("Row deleted.");
    },
    [editingCell?.rowId, supabase, tableName]
  );

  const busyMessage = isAdding
    ? "Adding row..."
    : savingCell
      ? `Saving ${columns.find((column) => column.key === savingCell.key)?.label ?? "changes"}...`
      : deletingRowId
        ? "Deleting row..."
        : "Double-click a cell to edit";

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-4">
        <Input
          placeholder="Search..."
          className="max-w-sm"
          value={search}
          disabled={isAdding}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Button
          onClick={addRow}
          size="sm"
          disabled={isAdding || !!savingCell || !!deletingRowId}
        >
          {isAdding ? "Adding..." : "Add Row"}
        </Button>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead key={column.key} style={{ width: column.width }}>
                  {column.label}
                </TableHead>
              ))}
              <TableHead className="w-[80px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((row) => (
              <TableRow key={String(row.id)}>
                {columns.map((column) => {
                  const isEditing =
                    editingCell?.rowId === String(row.id) &&
                    editingCell?.key === column.key;

                  return (
                    <TableCell key={column.key}>
                      {isEditing ? (
                        <Input
                          className="h-7 text-xs"
                          type={column.type === "number" ? "number" : "text"}
                          value={editValue}
                          disabled={
                            savingCell?.rowId === String(row.id) &&
                            savingCell.key === column.key
                          }
                          onChange={(event) => setEditValue(event.target.value)}
                          onBlur={saveEdit}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") saveEdit();
                            if (event.key === "Escape") setEditingCell(null);
                          }}
                          autoFocus
                        />
                      ) : (
                        <span
                          className={
                            column.editable !== false
                              ? "cursor-pointer rounded px-1 -mx-1 hover:bg-muted/50"
                              : ""
                          }
                          onDoubleClick={() => {
                            if (
                              column.editable !== false &&
                              !isAdding &&
                              !savingCell &&
                              !deletingRowId
                            ) {
                              startEdit(String(row.id), column.key, row[column.key]);
                            }
                          }}
                        >
                          {column.type === "number"
                            ? Number(row[column.key]).toLocaleString()
                            : String(row[column.key] ?? "")}
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
                    disabled={isAdding || !!savingCell || deletingRowId === String(row.id)}
                    onClick={() => deleteRow(String(row.id))}
                  >
                    {deletingRowId === String(row.id) ? "Deleting..." : "Delete"}
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
        {filtered.length} row{filtered.length !== 1 ? "s" : ""} &middot; {busyMessage}
      </p>
    </div>
  );
}
