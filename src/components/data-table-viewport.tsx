import type { ReactNode } from "react";
export function DataTableViewport({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className="data-table-scroll mt-4 max-w-full overflow-auto rounded-xl border border-stone-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
    >
      {children}
    </div>
  );
}
