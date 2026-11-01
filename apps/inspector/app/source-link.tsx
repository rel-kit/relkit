import { FileCode2 } from "lucide-react";
import { sourceLabel, sourceLink, type SourceLinkConfig } from "../lib/source-links";

/** Editor link for a declaration's source location; mono and quiet so it sits on meta lines. */
export function SourceLink({
  source,
  config,
}: {
  readonly source: unknown;
  readonly config?: SourceLinkConfig;
}) {
  const label = sourceLabel(source);
  const href = sourceLink(source, config);
  return href === undefined ? (
    <span className="inline-flex min-w-0 items-center gap-1 font-mono text-xs text-muted-foreground">
      <FileCode2 aria-hidden="true" className="size-3 shrink-0 opacity-70" />
      <span className="min-w-0 truncate">{label}</span>
    </span>
  ) : (
    <a
      className="source-link inline-flex min-w-0 items-center gap-1 font-mono text-xs text-muted-foreground no-underline underline-offset-2 hover:text-foreground hover:underline"
      href={href}
      rel="noreferrer"
      title={`Open ${label} in your editor`}
    >
      <FileCode2 aria-hidden="true" className="size-3 shrink-0 opacity-70" />
      <span className="min-w-0 truncate">{label}</span>
    </a>
  );
}
