"use client";

import { useAgent, useRoute } from "@relkit/client/react";
import { agentThreadIds } from "./agent-config";

function interruptQuestion(value: unknown): string {
  if (typeof value === "string") return value;
  if (
    value !== null &&
    typeof value === "object" &&
    "question" in value &&
    typeof value.question === "string"
  ) {
    return value.question;
  }
  return "Approve?";
}

export default function Page() {
  const greeting = useRoute("route.get.hello", { input: { name: "Relkit" } });
  const assistant = useAgent("hello.assistant");
  const review = useAgent("hello.review");

  return (
    <main>
      <h1>{greeting.data?.message ?? "Loading…"}</h1>
      <section>
        <h2>Typed agent</h2>
        <button
          onClick={() => void assistant.send("Greet Ada", { threadId: agentThreadIds.assistant })}
        >
          Run assistant
        </button>
        <button onClick={() => void assistant.observe({ threadId: agentThreadIds.assistant })}>
          Reconnect
        </button>
        <button onClick={() => void assistant.stop({ threadId: agentThreadIds.assistant })}>
          Stop
        </button>
        <p>{assistant.output?.answer ?? assistant.status}</p>
        {assistant.events.map((event) =>
          event.kind === "custom" ? <p key={event.eventId}>{event.data.message}</p> : null,
        )}
        <ul>
          {assistant.values?.todos.map((todo) => (
            <li key={todo.content}>{`${todo.status}: ${todo.content}`}</li>
          ))}
          {assistant.toolCalls.map((call) => (
            <li key={call.toolCallId}>{`${call.toolId}: ${call.state}`}</li>
          ))}
        </ul>
      </section>
      <section>
        <h2>Interrupt and resume</h2>
        <button
          onClick={() =>
            void review.run({ request: "Publish" }, { threadId: agentThreadIds.review })
          }
        >
          Start review
        </button>
        {review.waiting ? (
          <fieldset>
            <legend>{interruptQuestion(review.waiting.requests[0]?.value)}</legend>
            <button
              onClick={() =>
                void review.run(true, { threadId: agentThreadIds.review, resume: true })
              }
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
        <p>{review.output?.result ?? review.status}</p>
      </section>
    </main>
  );
}
