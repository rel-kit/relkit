"use client";

import { useChannel, useRoute, useRouteMutation, useStream } from "@relkit/client/react";
import { AgentExamples } from "./agent-examples";

export default function Page() {
  const orders = useRoute("GET /orders", { input: {}, staleTime: 30_000 });
  const announcements = useRoute("GET /announcements", { input: {}, staleTime: 30_000 });
  const post = useRouteMutation("POST /announcements", {
    onSuccess: async () => {
      await announcements.refetch();
    },
  });
  const report = useStream("GET /reports/:reportId");
  const channel = useChannel("announcements.feed", {
    params: {},
    on: {
      posted: () => {
        void announcements.refetch();
      },
    },
    onCaughtUp: async () => {
      await announcements.refetch();
    },
    onGap: async () => {
      await announcements.refetch();
    },
  });

  return (
    <main style={{ fontFamily: "system-ui", margin: "3rem auto", maxWidth: 720 }}>
      <h1>Relkit commerce client</h1>
      <p>Orders: {orders.data?.count ?? "loading"}</p>
      <p>
        Channel: {channel.status}; caught up: {String(channel.caughtUp)}
      </p>
      <button
        disabled={!channel.caughtUp || post.isPending}
        onClick={() => post.mutate({ message: `Update ${Date.now()}` })}
      >
        {post.isPending ? "Posting…" : "Post announcement"}
      </button>
      <span role="status">
        {post.isError ? ` Post failed: ${String(post.error)}` : post.isSuccess ? " Posted" : ""}
      </span>
      <ul>
        {(announcements.data?.messages ?? []).map((message, index) => (
          <li key={`${index}:${message}`}>{message}</li>
        ))}
      </ul>
      <button onClick={() => void report.start({ reportId: "daily" })}>Run report</button>
      <button onClick={() => report.cancel()}>Cancel report</button>
      <p>Report: {report.items.map((item) => item.completed).join(", ")}</p>
      <AgentExamples />
    </main>
  );
}
