import { cx } from "../../lib/cx";

export function Separator({
  orientation = "horizontal",
}: {
  readonly orientation?: "horizontal" | "vertical";
}) {
  return (
    <div
      aria-hidden="true"
      className={cx(
        "shrink-0 bg-[var(--line)]",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
      )}
    />
  );
}
