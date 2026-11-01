import { cn } from "@/lib/utils";
import { CopyButton } from "./copy-button";

/** Pretty-prints redacted JSON (or plain text) in a scrollable mono pane with a copy action. */
export function CodeBlock({
  value,
  label = "value",
  className,
  maxHeight = "24rem",
}: {
  readonly value: unknown;
  readonly label?: string;
  readonly className?: string;
  readonly maxHeight?: string;
}) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? null, null, 2);
  return (
    <div className={cn("relative min-w-0 rounded-md border border-border bg-muted/40", className)}>
      <div className="absolute top-1.5 right-1.5 z-[1]">
        <CopyButton value={text} label={`Copy ${label}`} />
      </div>
      <pre
        className="neon-scroll-fade safe-json m-0 overflow-auto p-3 pr-10 font-mono text-xs leading-5 text-foreground"
        style={{ maxHeight }}
      >
        {text}
      </pre>
    </div>
  );
}
