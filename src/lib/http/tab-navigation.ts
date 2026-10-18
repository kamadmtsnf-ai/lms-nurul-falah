import type { KeyboardEvent } from "react";
/** Follow the WAI-ARIA tab keyboard pattern without intercepting field editing. */
export function navigateTabs(event: KeyboardEvent<HTMLElement>) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  if (
    !(event.target instanceof HTMLElement) ||
    event.target.getAttribute("role") !== "tab"
  )
    return;
  const tabs = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>(
      '[role="tab"]:not(:disabled)',
    ),
  );
  const index = tabs.indexOf(event.target as HTMLButtonElement);
  if (index < 0 || !tabs.length) return;
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? tabs.length - 1
        : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) %
          tabs.length;
  event.preventDefault();
  tabs[next].focus();
  tabs[next].click();
}
