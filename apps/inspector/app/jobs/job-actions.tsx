"use client";

import { useState } from "react";
import type { InspectorObject } from "../../lib/api-types";
import { type JobAction, supportsJobAction } from "../../lib/job-actions";
import { RotateCcw, X } from "lucide-react";
import { Button } from "../../components/ui/button";
import { ConfirmationDialog } from "../confirmation-dialog";

export function JobActionButtons({
  item,
  capabilities,
  pending,
  onAction,
}: {
  readonly item: InspectorObject;
  readonly capabilities: readonly string[];
  readonly pending: boolean;
  readonly onAction: (action: JobAction, instanceId: string) => Promise<void>;
}) {
  const [confirming, setConfirming] = useState<JobAction>();
  const [actionPending, setActionPending] = useState(false);
  const [status, setStatus] = useState("");
  const state = text(item.state);
  const instanceId = text(item.instanceId) || text(item.id);
  const retryEnabled =
    instanceId !== "" && state === "dead-lettered" && supportsJobAction(capabilities, "retry");
  const cancelEnabled =
    instanceId !== "" &&
    !["completed", "dead-lettered", "cancelled"].includes(state) &&
    supportsJobAction(capabilities, "cancel");

  const request = (action: JobAction) => {
    if (confirming !== undefined || pending || actionPending) return;
    setStatus("");
    setConfirming(action);
  };

  const confirm = (): void => {
    if (confirming === undefined) return;
    const action = confirming;
    setActionPending(true);
    void onAction(action, instanceId)
      .then(() => setStatus(`${action === "retry" ? "Retry" : "Cancel"} completed.`))
      .catch(() => setStatus(`${action === "retry" ? "Retry" : "Cancel"} failed.`))
      .finally(() => {
        setActionPending(false);
        setConfirming(undefined);
      });
  };

  const label = instanceId === "" ? "job" : `job ${instanceId}`;
  const actionBusy = pending || actionPending;

  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      role="group"
      aria-label={`Local actions for ${label}`}
    >
      <Button
        variant="secondary"
        size="sm"
        isDisabled={!retryEnabled || actionBusy || confirming !== undefined}
        onPress={() => request("retry")}
      >
        <RotateCcw aria-hidden="true" />
        Retry dead letter
      </Button>
      <Button
        variant="ghost"
        size="sm"
        isDisabled={!cancelEnabled || actionBusy || confirming !== undefined}
        onPress={() => request("cancel")}
      >
        <X aria-hidden="true" />
        Cancel
      </Button>
      {!supportsJobAction(capabilities, "retry") && !supportsJobAction(capabilities, "cancel") && (
        <small className="text-[11px] text-muted-foreground">
          Local actions are not advertised by this API.
        </small>
      )}
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {status}
      </span>
      <ConfirmationDialog
        open={confirming !== undefined}
        title={confirming === "retry" ? "Retry dead-lettered job?" : "Cancel job?"}
        description={`This changes ${label} in the local development generation.`}
        confirmLabel={confirming === "retry" ? "Retry job" : "Cancel job"}
        busy={actionBusy}
        onConfirm={confirm}
        onCancel={() => {
          if (!actionBusy) setConfirming(undefined);
        }}
      />
    </div>
  );
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
