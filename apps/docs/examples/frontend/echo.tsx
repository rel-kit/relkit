"use client";

/** Calls the documented POST /echo function route after an explicit user action. */
import { useRelkitClient, useRouteMutation } from "@relkit/client/react";

/** Sends domain input and renders the validated output; the hook owns mutation state.
 * @returns An Echo button with pending, failure, and success feedback. */
export function EchoButton() {
  const { status } = useRelkitClient();
  const echo = useRouteMutation("POST /echo");

  return (
    <section>
      <button
        disabled={status !== "ready" || echo.isPending}
        onClick={() => echo.mutate({ message: "Hello from the frontend" })}
      >
        Send message
      </button>
      {echo.isPending && <p role="status">Sending…</p>}
      {echo.isError && <p role="alert">{String(echo.error)}</p>}
      {echo.isSuccess && <p>{echo.data.message}</p>}
    </section>
  );
}
