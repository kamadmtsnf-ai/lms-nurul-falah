"use client";
import { useEffect, useId, useRef, useState } from "react";
import { X, ExternalLink } from "lucide-react";
import { Button } from "./ui/button";
import { postJson } from "@/lib/http/client";
import { previewKind } from "@/lib/learning/preview";
export function FilePreview({
  course,
  file,
  onClose,
}: {
  course: string;
  file: { id: string; name: string };
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    title = useId();
  const [data, setData] = useState<{ url: string; mime: string } | null>(null),
    [error, setError] = useState(""),
    [loaded, setLoaded] = useState(false),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    const node = dialog.current!,
      previous = document.activeElement as HTMLElement | null,
      overflow = document.body.style.overflow;
    node.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      node.close();
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    setData(null);
    setError("");
    setLoaded(false);
    void postJson<{ url: string; mime: string }>(
      "/api/pembelajaran/file-preview",
      { course, target: file.id },
      abort.signal,
    )
      .then((r) => {
        if (!previewKind(r.mime))
          throw new Error("Format ini tidak mendukung pratinjau.");
        if (!abort.signal.aborted) setData(r);
      })
      .catch((e) => {
        if (!abort.signal.aborted)
          setError(
            e instanceof Error ? e.message : "Pratinjau belum tersedia.",
          );
      });
    return () => abort.abort();
  }, [course, file.id, revision]);
  return (
    <dialog
      ref={dialog}
      aria-labelledby={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="confirm-dialog m-auto w-[calc(100%_-_1rem)] max-w-5xl rounded-2xl border border-stone-200 bg-white p-0 shadow-2xl"
    >
      <header className="flex items-start gap-3 border-b border-stone-200 p-4 sm:p-5">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-emerald-700">
            Pratinjau lampiran
          </p>
          <h2
            id={title}
            title={file.name}
            className="mt-1 line-clamp-2 break-words text-base font-semibold [overflow-wrap:anywhere]"
          >
            {file.name}
          </h2>
        </div>
        <button
          type="button"
          autoFocus
          aria-label="Tutup pratinjau"
          onClick={onClose}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-emerald-700"
        >
          <X size={20} />
        </button>
      </header>
      <div className="min-h-40 bg-stone-50 p-3 sm:p-5">
        {!error && !loaded && (
          <p role="status" className="p-3 text-sm text-stone-600">
            Menyiapkan pratinjau…
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="rounded-xl bg-red-50 p-4 text-sm text-red-800"
          >
            {error}
          </p>
        )}
        {data &&
          (previewKind(data.mime) === "image" ? (
            <img
              src={data.url}
              alt={file.name}
              referrerPolicy="no-referrer"
              onLoad={() => setLoaded(true)}
              onError={() => {
                setLoaded(true);
                setError(
                  "Gambar belum dapat ditampilkan. Muat ulang pratinjau atau unduh berkas.",
                );
              }}
              className="mx-auto max-h-[65dvh] max-w-full rounded-lg object-contain"
            />
          ) : (
            <iframe
              title={`PDF ${file.name}`}
              src={data.url}
              referrerPolicy="no-referrer"
              onLoad={() => setLoaded(true)}
              className="h-[60dvh] min-h-60 w-full rounded-lg border border-stone-200 bg-white"
            />
          ))}
      </div>
      <footer className="flex flex-wrap items-center gap-3 border-t border-stone-200 p-4">
        <p className="w-full text-xs leading-5 text-stone-500">
          Jika PDF tidak tampil di browser ponsel, buka di tab baru. Tautan
          sementara dapat dimuat ulang saat kedaluwarsa.
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={() => setRevision((v) => v + 1)}
        >
          Muat ulang pratinjau
        </Button>
        {data && (
          <a
            href={data.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-emerald-800 underline"
          >
            <ExternalLink size={16} />
            Buka di tab baru
          </a>
        )}
      </footer>
    </dialog>
  );
}
