"use client";
import { useEffect, useId, useRef } from "react";
import { CircleAlert, X } from "lucide-react";
import { Button } from "./ui/button";
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  busy = false,
  error,
  onCancel,
  onConfirm,
  children,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  busy?: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: () => void;
  children?: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    titleId = useId(),
    descriptionId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
      className="confirm-dialog m-auto w-[calc(100%_-_2rem)] max-w-md rounded-3xl border border-stone-200 bg-white p-0 text-stone-900 shadow-2xl"
    >
      <div className="relative p-5 sm:p-7">
        <button
          type="button"
          aria-label="Tutup konfirmasi"
          disabled={busy}
          onClick={onCancel}
          className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-xl text-stone-500 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-emerald-700 disabled:opacity-50"
        >
          <X size={20} />
        </button>
        <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
          <CircleAlert size={24} />
        </span>
        <h2 id={titleId} className="pr-6 text-xl font-semibold tracking-tight">
          {title}
        </h2>
        <p id={descriptionId} className="mt-3 text-sm leading-6 text-stone-600">
          {description}
        </p>
        {children}
        {error && (
          <p
            role="alert"
            className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800"
          >
            {error}
          </p>
        )}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            autoFocus
            disabled={busy}
            onClick={onCancel}
          >
            Batal
          </Button>
          <Button type="button" disabled={busy} onClick={onConfirm}>
            {busy ? "Memproses…" : confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
