"use client";
import { useEffect, useState } from "react";
/** Prevent controls from accepting edits or clicks before their handlers exist. */
export function ClientReady({
  children,
  className = "",
  label = "Kontrol halaman",
}: {
  children: React.ReactNode;
  className?: string;
  label?: string;
}) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return (
    <fieldset
      disabled={!ready}
      aria-busy={!ready}
      className={`client-ready ${className}`}
    >
      <legend className="sr-only">{label}</legend>
      {!ready && (
        <p role="status" className="mb-4 text-xs text-stone-500">
          Menyiapkan kontrol halaman…
        </p>
      )}
      {children}
    </fieldset>
  );
}
