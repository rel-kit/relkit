"use client";

/** Renders the minimal backend's greeting through the pulled registry and a same-origin client provider. */
import { RelkitClientProvider, useRelkitClient, useRoute } from "@relkit/client/react";

// #region greeting
/** Displays the typed Hello result after the provider resolves backend identity.
 * @returns Loading, connection failure, request failure, or the successful greeting. */
export function Greeting() {
  const { status } = useRelkitClient();
  const greeting = useRoute("GET /hello", { input: { name: "RELKIT" } });

  if (status === "application-updated") {
    return <p role="alert">The API changed. Pull its contract and restart the frontend.</p>;
  }
  if (status === "error") return <p role="alert">Cannot connect to the API.</p>;
  if (greeting.isError) return <p role="alert">{greeting.error.message}</p>;
  if (greeting.isPending) return <p role="status">Loading greeting…</p>;
  return <h1>{greeting.data.message}</h1>;
}
// #endregion greeting

/** Supplies the shared query cache and identity handshake to the frontend tree.
 * @returns The greeting inside a same-origin RELKIT provider. */
export default function App() {
  return (
    <RelkitClientProvider>
      <Greeting />
    </RelkitClientProvider>
  );
}
