import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "../../../components/ui/button";

export function RunsPagination({
  page,
  hasMore,
  nextCursor,
  loading,
  onPrevious,
  onNext,
  label = "Run history pagination",
}: {
  readonly page: number;
  readonly hasMore: boolean;
  readonly nextCursor: string | undefined;
  readonly loading: boolean;
  readonly onPrevious: () => void;
  readonly onNext: () => void;
  readonly label?: string;
}) {
  return (
    <nav aria-label={label} className="flex items-center justify-between gap-3">
      <Button variant="secondary" size="sm" isDisabled={page === 0 || loading} onPress={onPrevious}>
        <ChevronLeft aria-hidden="true" /> Previous
      </Button>
      <span aria-live="polite" className="font-mono text-[11px] text-muted-foreground tabular-nums">
        Page {page + 1}
      </span>
      <Button
        variant="secondary"
        size="sm"
        isDisabled={!hasMore || nextCursor === undefined || loading}
        onPress={onNext}
      >
        Next <ChevronRight aria-hidden="true" />
      </Button>
    </nav>
  );
}
