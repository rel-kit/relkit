"use client";

import { useEffect, useId, useRef } from "react";

export function ConfirmationDialog({
  open,
  title,
  description,
  confirmLabel,
  busy = false,
  onConfirm,
  onCancel,
}: {
  readonly open: boolean;
  readonly title: string;
  readonly description: string;
  readonly confirmLabel: string;
  readonly busy?: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const id = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (open) {
      previousFocus.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (!dialog.open) dialog.showModal();
      cancelRef.current?.focus();
      return;
    }
    if (dialog.open) dialog.close();
    previousFocus.current?.focus();
    previousFocus.current = null;
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="confirmation-dialog rounded-lg border border-border bg-popover text-foreground"
      aria-modal="true"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <div className="confirmation-dialog-content grid gap-3 p-5">
        <h2 id={`${id}-title`} className="text-[15px] font-semibold text-foreground">
          {title}
        </h2>
        <p id={`${id}-description`} className="m-0 text-[13px] leading-5 text-muted-foreground">
          {description}
        </p>
        {busy && (
          <p
            className="m-0 flex items-center gap-2 font-mono text-[11px] text-muted-foreground"
            role="status"
            aria-live="polite"
          >
            <span
              aria-hidden="true"
              className="neon-status-breathe size-1.5 rounded-[1px] bg-live text-live"
            />
            Applying action…
          </p>
        )}
        <div className="dialog-actions mt-2 flex justify-end gap-2">
          <button
            ref={cancelRef}
            className={`${buttonBase} border border-border bg-card text-foreground hover:bg-muted`}
            type="button"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className={`${buttonBase} bg-primary text-primary-foreground hover:bg-primary/90`}
            type="button"
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? "Applying…" : confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}

const buttonBase =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-[13px] font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-50";
