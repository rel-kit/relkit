"use client";

/** Starts the commerce review graph and answers its boolean interrupt on the same business thread. */
import { useAgent, useRelkitClient } from "@relkit/client/react";
import { useState } from "react";

/** Keeps initial input and a waiting reply distinct while rendering the graph's final result.
 * @param props - Authorized order-review thread retained by the application.
 * @returns Start/approve actions, current result, and visible submission failure. */
export function OrderReview({ threadId }: { readonly threadId: string }) {
  const { status } = useRelkitClient();
  const review = useAgent("orders.order-review");
  const [failure, setFailure] = useState("");

  /** Starts one review; uncertain acceptance is left for explicit thread recovery.
   * @returns Completion after acceptance or displaying the failure. */
  async function startReview() {
    try {
      await review.run({ orderId: "demo-1" }, { threadId });
    } catch (error) {
      setFailure(String(error));
    }
  }

  /** Replies with the review node's declared boolean on the original thread.
   * @returns Completion after the continuation is accepted or its failure is displayed. */
  async function approve() {
    try {
      await review.run(true, { threadId, resume: true });
    } catch (error) {
      setFailure(String(error));
    }
  }

  return (
    <section>
      <button
        disabled={status !== "ready" || review.status !== "idle" || failure !== ""}
        onClick={startReview}
      >
        Start review
      </button>
      <button
        disabled={status !== "ready" || review.status !== "waiting" || failure !== ""}
        onClick={approve}
      >
        Approve order
      </button>
      <p role="status">{review.output?.result ?? review.status}</p>
      {failure && <p role="alert">{failure}. Check this thread before submitting again.</p>}
    </section>
  );
}
