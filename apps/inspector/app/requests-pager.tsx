"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "../components/ui/button";

/** Moves between pages of a newest-first list: Newer goes toward the latest request. */
export function RequestsPager({
  hasNewer,
  hasOlder,
  disabled,
  onNewer,
  onOlder,
}: {
  readonly hasNewer: boolean;
  readonly hasOlder: boolean;
  readonly disabled: boolean;
  readonly onNewer: () => void;
  readonly onOlder: () => void;
}) {
  return (
    <nav className="flex items-center justify-between gap-3" aria-label="Pagination">
      <Button variant="secondary" size="sm" isDisabled={!hasNewer || disabled} onPress={onNewer}>
        <ChevronLeft aria-hidden="true" className="size-3.5" /> Newer requests
      </Button>
      <Button variant="secondary" size="sm" isDisabled={!hasOlder || disabled} onPress={onOlder}>
        Older requests <ChevronRight aria-hidden="true" className="size-3.5" />
      </Button>
    </nav>
  );
}
