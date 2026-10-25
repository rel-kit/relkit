"use client";

/** Sends an explicit support request to the commerce agent and renders its public typed answer. */
import { useAgent, useRelkitClient } from "@relkit/client/react";
import { useState } from "react";

/** Uses an application-owned business thread rather than creating one during rendering.
 * @param props - Authorized thread identity retained by the application.
 * @returns A send action, observed answer, and visible submission failure. */
export function OrderSupport({ threadId }: { readonly threadId: string }) {
  const { status } = useRelkitClient();
  const support = useAgent("orders.order-support");
  const [failure, setFailure] = useState("");

  /** Submits once; uncertain acceptance stays visible for explicit recovery.
   * @returns Completion after acceptance or displaying the failure. */
  async function askSupport() {
    setFailure("");
    try {
      await support.send("Where is order demo-1?", { threadId });
    } catch (error) {
      setFailure(String(error));
    }
  }

  return (
    <section>
      <button
        disabled={status !== "ready" || support.status !== "idle" || failure !== ""}
        onClick={askSupport}
      >
        Ask about the order
      </button>
      <p role="status">{support.output?.answer ?? support.status}</p>
      {failure && <p role="alert">{failure}. Check this thread before submitting again.</p>}
    </section>
  );
}
