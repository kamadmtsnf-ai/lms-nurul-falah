/** Deliberately exclude SVG/HTML and Office documents from inline rendering. */
export function previewKind(mime?: string): "image" | "pdf" | null {
  if (mime === "application/pdf") return "pdf";
  return ["image/jpeg", "image/png", "image/webp"].includes(mime ?? "")
    ? "image"
    : null;
}
