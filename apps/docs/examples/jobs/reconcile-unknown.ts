import { isJobUnknownOutcome } from "@relkit/client/react";

export function recoveryAction(error: unknown): string {
  if (!isJobUnknownOutcome(error)) return "Handle the ordinary request error.";
  switch (error.recovery.action) {
    case "retry-with-same-key":
      return `Inspect the receipt for ${error.operationId}; retry only with the same key and request.`;
    case "inspect-native":
      return `Inspect provider state for ${error.operationId} before taking action.`;
    case "unavailable":
      return `Outcome ${error.operationId} is unknown; reconcile manually.`;
  }
}
