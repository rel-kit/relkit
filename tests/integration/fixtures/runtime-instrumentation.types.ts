/** Native test owners and captured propagation domains for the receipt continuation fixture. */
import type { TestBucketFake, TestEventFake } from "../../../packages/testing/src/index.js";
export interface ReceiptPayload {
  readonly orderId: string;
  readonly receiptKey: string;
}
export interface CapturedSpan {
  readonly name: string;
  readonly traceId: string;
  readonly links?: readonly { readonly traceId: string; readonly spanId: string }[];
}
export interface InstrumentationFixture {
  readonly receipts: TestBucketFake;
  readonly event: TestEventFake<ReceiptPayload, void>;
  readonly eventSpans: CapturedSpan[];
}
