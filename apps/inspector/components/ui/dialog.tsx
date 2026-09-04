"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Dialog, DialogTrigger, Heading, Modal, ModalOverlay } from "react-aria-components";
import { cx } from "../../lib/cx";
import { Button } from "./button";

interface OverlayDialogProps {
  readonly trigger: ReactNode;
  readonly title: string;
  readonly description?: string;
  readonly children: ReactNode;
  readonly placement?: "center" | "right" | "right-wide";
  readonly isOpen?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
}

export function OverlayDialog({
  trigger,
  title,
  description,
  children,
  placement = "center",
  isOpen,
  onOpenChange,
}: OverlayDialogProps) {
  return (
    <DialogTrigger isOpen={isOpen} onOpenChange={onOpenChange}>
      {trigger}
      <ModalOverlay className="overlay-dialog-backdrop fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-[2px]">
        <Modal
          data-placement={placement}
          className={cx(
            "overlay-dialog-panel fixed overflow-auto border border-[var(--line)] bg-[var(--panel)] shadow-2xl outline-none",
            placement !== "center"
              ? `inset-y-0 right-0 h-full ${placement === "right-wide" ? "w-[min(64rem,96vw)]" : "w-[min(32rem,94vw)]"} rounded-l-xl border-y-0 border-r-0`
              : "left-1/2 top-[12vh] max-h-[90vh] w-[min(42rem,92vw)] -translate-x-1/2 rounded-xl",
          )}
        >
          <Dialog className="outline-none">
            {({ close }) => (
              <>
                <header
                  className={cx(
                    "flex items-start justify-between gap-4 border-b border-[var(--line)]",
                    placement === "center" ? "p-5" : "px-1 py-4 text-start",
                  )}
                >
                  <div>
                    <Heading slot="title" className="text-lg font-semibold">
                      {title}
                    </Heading>
                    {description && (
                      <p className="mt-1 text-sm text-[var(--muted)]">{description}</p>
                    )}
                  </div>
                  <Button variant="ghost" size="icon" onPress={close} aria-label="Close dialog">
                    <X aria-hidden="true" className="size-4" />
                  </Button>
                </header>
                <div className={placement === "center" ? "p-5" : "px-1 py-4 text-start"}>
                  {children}
                </div>
              </>
            )}
          </Dialog>
        </Modal>
      </ModalOverlay>
    </DialogTrigger>
  );
}
