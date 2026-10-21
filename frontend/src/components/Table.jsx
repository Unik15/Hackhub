import React from "react";
import { Inbox } from "lucide-react";

/**
 * columns: [{ header, accessor, render?(row) }]
 * data: array of row objects
 */
export default function Table({ columns, data, keyField = "id", emptyMessage = "No data available." }) {
  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card py-14 text-center">
        <Inbox size={22} className="text-muted-foreground" />
        <p className="font-ui text-sm text-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full min-w-[480px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs font-ui uppercase tracking-wide text-muted-foreground">
            {columns.map((col) => (
              <th key={col.header || col.accessor} className="px-5 py-3 font-medium">
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={row[keyField] ?? i} className="border-b border-border/60 last:border-0 transition-colors hover:bg-muted/40">
              {columns.map((col) => (
                <td key={col.header || col.accessor} className="px-5 py-4 font-body text-foreground">
                  {col.render ? col.render(row) : row[col.accessor]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
