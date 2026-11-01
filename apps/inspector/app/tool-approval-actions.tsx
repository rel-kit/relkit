"use client";

import { useState } from "react";
import type { InspectorApiClient } from "../lib/api";
import { Check, X } from "lucide-react";
import { Button } from "../components/ui/button";
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
    <div
      role="group"
      aria-label={`Actions for tool call ${approval.toolCallId}`}
      className="grid justify-items-end gap-1"
    >
      <div className="flex items-center gap-1.5">
        <Button
          variant="secondary"
          size="sm"
          isDisabled={pending || !supportsToolApproval(capabilities, "deny")}
          onPress={() => void run("deny")}
        >
          <X aria-hidden="true" />
          Deny
        </Button>
        <Button
          size="sm"
          isDisabled={pending || !supportsToolApproval(capabilities, "approve")}
          onPress={() => void run("approve")}
        >
          <Check aria-hidden="true" />
          Approve
        </Button>
      </div>
      {error !== "" && (
        <p className="m-0 text-[11px] text-danger" role="alert">
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
