import type { ReactNode } from "react";
import { EmptyState } from "../../components/neon/empty-state";
import { NO_JOBS_HINT, NO_JOBS_MESSAGE } from "../../lib/api-request-utils";

/** The one empty state of every jobs page for an application that declares no jobs. */
export function JobsNoneDeclared({
  icon,
  size = "md",
}: {
  readonly icon: ReactNode;
  readonly size?: "md" | "lg";
}) {
  return (
    <EmptyState
      size={size}
      icon={icon}
      title={<span role="status">{NO_JOBS_MESSAGE}</span>}
      description={NO_JOBS_HINT}
    />
  );
}
