export function RunsPagination({
  page,
  hasMore,
  nextCursor,
  loading,
  onPrevious,
  onNext,
}: {
  readonly page: number;
  readonly hasMore: boolean;
  readonly nextCursor: string | undefined;
  readonly loading: boolean;
  readonly onPrevious: () => void;
  readonly onNext: () => void;
}) {
  return (
    <nav aria-label="Run history pagination" className="flex items-center justify-between gap-3">
      <button
        className="button button-secondary"
        disabled={page === 0 || loading}
        onClick={onPrevious}
        type="button"
      >
        Previous
      </button>
      <span aria-live="polite">Page {page + 1}</span>
      <button
        className="button button-secondary"
        disabled={!hasMore || nextCursor === undefined || loading}
        onClick={onNext}
        type="button"
      >
        Next
      </button>
    </nav>
  );
}
