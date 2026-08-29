import { basename } from "node:path";

/** Ordinary application code; it is not a RelKit capability or descriptor. */
export function receiptObjectName(orderId: string): string {
  return basename(`/orders/${orderId}.json`);
}
