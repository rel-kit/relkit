import { sourceLabel, sourceLink, type SourceLinkConfig } from "../lib/source-links";

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
    <span>{label}</span>
  ) : (
    <a className="text-link source-link" href={href} rel="noreferrer">
      {label}
    </a>
  );
}
