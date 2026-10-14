/** Native test owners and captured propagation domains for the receipt continuation fixture. */
import type {
  TestBucketFake,
  TestEventFake,
  TestJobFake,
} from "../../../packages/testing/src/index.js";
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
  readonly job: TestJobFake<ReceiptPayload, { readonly receiptId: string }>;
  readonly event: TestEventFake<ReceiptPayload, void>;
  readonly jobSpans: CapturedSpan[];
  readonly eventSpans: CapturedSpan[];
}
