"use client";

import { useState } from "react";
import type { InspectorApiClient } from "../lib/api";
import { ConfirmationDialog } from "./confirmation-dialog";
import {
  invokeToolApproval,
  supportsToolApproval,
  type ToolApprovalAction,
} from "../lib/tool-actions";
import type { ToolApprovalView } from "../lib/agents-model";

export function ToolApprovalActions({
  client,
  approval,
  capabilities,
  generationId,
  graphHash,
  onComplete,
}: {
  readonly client: InspectorApiClient;
  readonly approval: ToolApprovalView;
  readonly capabilities: readonly string[];
  readonly generationId: string;
  readonly graphHash: string;
  readonly onComplete: () => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState<ToolApprovalAction>();
  const [status, setStatus] = useState("");
  const run = (action: ToolApprovalAction): void => {
    if (!supportsToolApproval(capabilities, action) || pending || confirming !== undefined) return;
    setConfirming(action);
  };

  const confirm = async (): Promise<void> => {
    if (confirming === undefined) return;
    const action = confirming;
    setPending(true);
    setError("");
    setStatus("");
    try {
      await invokeToolApproval(client, action, {
        toolId: approval.toolId,
        invocationId: approval.invocationId,
        toolCallId: approval.toolCallId,
        generationId,
        graphHash,
        idempotencyKey: `inspector-tool-${crypto.randomUUID()}`,
      });
      await onComplete();
      setStatus(`${action === "approve" ? "Approval" : "Denial"} recorded.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Tool approval failed.");
    } finally {
      setPending(false);
      setConfirming(undefined);
    }
  };
  return (
    <div role="group" aria-label={`Actions for tool call ${approval.toolCallId}`}>
      <div className="route-row-detail">
        <button
          className="button-link"
          type="button"
          disabled={pending || !supportsToolApproval(capabilities, "approve")}
          onClick={() => void run("approve")}
        >
          Approve
        </button>
        <button
          className="button-link"
          type="button"
          disabled={pending || !supportsToolApproval(capabilities, "deny")}
          onClick={() => void run("deny")}
        >
          Deny
        </button>
      </div>
      {error !== "" && (
        <p className="field-errors" role="alert">
          {error}
        </p>
      )}
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {status}
      </span>
      <ConfirmationDialog
        open={confirming !== undefined}
        title={confirming === "approve" ? "Approve pending tool call?" : "Deny pending tool call?"}
        description={`This records a ${confirming === "approve" ? "tool approval" : "tool denial"} for ${approval.toolCallId}.`}
        confirmLabel={confirming === "approve" ? "Approve call" : "Deny call"}
        busy={pending}
        onConfirm={() => void confirm()}
        onCancel={() => {
          if (!pending) setConfirming(undefined);
        }}
      />
    </div>
  );
}
