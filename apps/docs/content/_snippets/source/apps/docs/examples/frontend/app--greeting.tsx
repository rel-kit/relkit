/** Displays the typed Hello result after the provider resolves backend identity.
 * @returns Loading, connection failure, request failure, or the successful greeting. */
export function Greeting() {
  const { status } = useRelkitClient();
  const greeting = useRoute(api.hello.greet, { input: { name: "RelKit" } });

  if (status === "application-updated") {
    return <p role="alert">The API changed. Pull its contract and rebuild the frontend.</p>;
  }
  if (status === "error") return <p role="alert">Cannot connect to the API.</p>;
  if (greeting.isError) return <p role="alert">{greeting.error.message}</p>;
  if (greeting.isPending) return <p role="status">Loading greeting…</p>;
  return <h1>{greeting.data.message}</h1>;
}
