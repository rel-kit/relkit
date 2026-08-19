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
      className="confirmation-dialog"
      aria-modal="true"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <div className="confirmation-dialog-content">
        <h2 id={`${id}-title`}>{title}</h2>
        <p id={`${id}-description`}>{description}</p>
        {busy && (
          <p className="supporting-copy" role="status" aria-live="polite">
            Applying action…
          </p>
        )}
        <div className="dialog-actions">
          <button
            ref={cancelRef}
            className="button-link button-link--quiet"
            type="button"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button className="button-link" type="button" disabled={busy} onClick={onConfirm}>
            {busy ? "Applying…" : confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
