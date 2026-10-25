"use client";

/** Combines the commerce announcement query with channel invalidation and reconnect recovery. */
import { useChannel, useRoute } from "@relkit/client/react";

/** Restores authoritative messages on publication, catch-up, and replay gaps.
 * @returns The current messages with query failure and channel status feedback. */
export function Announcements() {
  const messages = useRoute("GET /announcements", { input: {} });
  const channel = useChannel("announcements.feed", {
    params: {},
    on: {
      posted: () => {
        void messages.refetch();
      },
    },
    onCaughtUp: async () => {
      await messages.refetch();
    },
    onGap: async () => {
      await messages.refetch();
    },
  });

  if (messages.isError) return <p role="alert">{messages.error.message}</p>;
  return (
    <section>
      <p role="status">Channel: {channel.status}</p>
      {messages.isPending && <p>Loading messages…</p>}
      <ul>
        {messages.data?.messages.map((message, index) => (
          <li key={index}>{message}</li>
        ))}
      </ul>
    </section>
  );
}
