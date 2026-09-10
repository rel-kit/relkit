"use client";

import { useAgent } from "@relkit/client/react";
import { agentThreadIds, interruptQuestion } from "./agent-example-config";

export function AgentExamples() {
  const support = useAgent("orders.order-support");
  const deep = useAgent("orders.order-deep");
  const review = useAgent("orders.order-review");
  const latestRun = support.snapshot?.currentRuns.at(-1);

  return (
    <section aria-labelledby="agent-examples-heading">
      <h2 id="agent-examples-heading">Typed agent examples</h2>
      <button
        disabled={support.status !== "idle"}
        onClick={() =>
          void support.send("Where is order demo-1?", { threadId: agentThreadIds.support })
        }
      >
        Ask support agent
      </button>
      <button
        disabled={support.status !== "running"}
        onClick={() => void support.stop({ threadId: agentThreadIds.support })}
      >
        Stop support agent
      </button>
      <button
        disabled={deep.status !== "idle"}
        onClick={() =>
          void deep.send("Delegate an inventory check.", { threadId: agentThreadIds.deep })
        }
      >
        Run DeepAgent
      </button>
      <button
        disabled={review.status !== "idle"}
        onClick={() => void review.run({ orderId: "demo-1" }, { threadId: agentThreadIds.review })}
      >
        Start review graph
      </button>
      {review.waiting ? (
        <fieldset>
          <legend>{interruptQuestion(review.waiting.requests[0]?.value)}</legend>
          <button
            onClick={() => void review.run(true, { threadId: agentThreadIds.review, resume: true })}
          >
            Approve
          </button>
          <button
            onClick={() =>
              void review.run(false, { threadId: agentThreadIds.review, resume: true })
            }
          >
            Reject
          </button>
        </fieldset>
      ) : null}
      <p>
        Support: {support.status}; latest run: {latestRun?.outcome ?? latestRun?.status ?? "none"}
      </p>
      <p>
        Todos: {support.values?.todos.map((todo) => `${todo.status}: ${todo.content}`).join(", ")}
      </p>
      <p>DeepAgent: {deep.output?.answer ?? deep.status}</p>
      <p>Review: {review.output?.result ?? review.status}</p>
      <ul>
        {support.timeline.map((item) => (
          <li key={item.key}>
            {item.kind === "message"
              ? `${item.message.role}: ${item.message.parts.map((part) => part.text).join("")}`
              : item.kind === "tool"
                ? `tool ${item.toolCall.toolId}: ${item.toolCall.state}`
                : `progress: ${JSON.stringify(item.progress.value)}`}
          </li>
        ))}
      </ul>
    </section>
  );
}
