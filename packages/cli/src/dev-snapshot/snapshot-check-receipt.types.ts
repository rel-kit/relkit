/**
 * Shares the schema-derived current-check receipt between persistence, checking,
 * and preparation without widening decoded values or retaining physical roots.
 */
import type { Schema } from "effect";
import type { SnapshotCheckReceipt as ReceiptSchema } from "./snapshot-check-receipt.schemas.js";

/** Decoded successful development-check cache record. */
export interface SnapshotCheckReceipt extends Schema.Schema.Type<typeof ReceiptSchema> {}
