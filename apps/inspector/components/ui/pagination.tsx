"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./button";

export function Pagination({
  page,
  hasPrevious,
  hasNext,
  disabled,
  onPrevious,
  onNext,
}: {
  readonly page: number;
  readonly hasPrevious: boolean;
  readonly hasNext: boolean;
  readonly disabled?: boolean;
  readonly onPrevious: () => void;
  readonly onNext: () => void;
}) {
  return (
    <nav className="flex items-center justify-between gap-3" aria-label="Pagination">
      <Button
        variant="secondary"
        size="sm"
        isDisabled={!hasPrevious || disabled}
        onPress={onPrevious}
      >
        <ChevronLeft aria-hidden="true" className="size-3.5" /> Previous
      </Button>
      <span className="text-xs text-[var(--muted)]" aria-live="polite">
        Page {page}
      </span>
      <Button variant="secondary" size="sm" isDisabled={!hasNext || disabled} onPress={onNext}>
        Next <ChevronRight aria-hidden="true" className="size-3.5" />
      </Button>
    </nav>
  );
}
