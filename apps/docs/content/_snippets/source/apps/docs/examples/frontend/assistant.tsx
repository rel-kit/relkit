"use client";

/** Sends one greeting to the documented hello.assistant agent and observes its typed answer. */
import { useAgent, useRelkitClient } from "@relkit/client/react";
import { useState } from "react";

/** Keeps the application-owned thread identity stable across rendering and observation.
 * @param props - Authorized conversation identity retained by the application.
 * @returns A greeting action, the observed answer, and explicit submission failure. */
export function Assistant({ threadId }: { readonly threadId: string }) {
  const { status } = useRelkitClient();
  const assistant = useAgent("hello.assistant");
  const [failure, setFailure] = useState("");

  /** Submits once and preserves uncertain outcomes for explicit recovery.
   * @returns Completion after acceptance or displaying the failure. */
  async function sendGreeting() {
    try {
      await assistant.send("Hello, RELKIT!", { threadId });
    } catch (error) {
      setFailure(String(error));
    }
  }

  return (
    <section>
      <button
        disabled={status !== "ready" || assistant.status !== "idle" || failure !== ""}
        onClick={sendGreeting}
      >
        Say hello
      </button>
      <p role="status">{assistant.output?.answer ?? assistant.status}</p>
      {failure && <p role="alert">{failure}. Check this thread before submitting again.</p>}
    </section>
  );
}
