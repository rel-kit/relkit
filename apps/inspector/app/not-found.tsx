import { Compass } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "../components/blocks/page-header";
import { EmptyState } from "../components/neon/empty-state";

// The overview's link-button look; overview-panels is a client module, so it is not imported.
const linkButtonClass =
  "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium text-foreground no-underline transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60";

/** Unknown addresses render inside the shell, so navigation and status stay usable (IN-42). */
export default function NotFound() {
  return (
    <div className="route-page">
      <PageHeader title="Page not found" />
      <EmptyState
        icon={<Compass />}
        title="No Inspector page has this address."
        description="Check the address, or choose a page from the navigation."
        action={
          <Link href="/" className={linkButtonClass}>
            Open the overview
          </Link>
        }
      />
    </div>
  );
}
