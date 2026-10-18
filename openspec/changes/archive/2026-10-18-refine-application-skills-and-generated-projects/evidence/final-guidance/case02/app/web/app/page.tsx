"use client";

import { useRoute } from "@relkit/client/react";
import { useState, type FormEvent } from "react";

export default function Page() {
  const [draft, setDraft] = useState("Relkit");
  const [name, setName] = useState("Relkit");
  const greeting = useRoute("route.get.hello", { input: { name }, retry: false });
  const validName = draft.trim().length > 0 && draft.trim().length <= 80;

  function updateGreeting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validName || greeting.isFetching) return;
    const submitted = draft.trim();
    setDraft(submitted);
    if (submitted === name) void greeting.refetch();
    else setName(submitted);
  }

  return (
    <main>
      <h1 aria-live="polite">{greeting.data?.message ?? "Loading greeting…"}</h1>
      <section aria-label="Greeting" aria-busy={greeting.isFetching}>
        <form onSubmit={updateGreeting}>
          <label htmlFor="greeting-name">Name</label>
          <input
            id="greeting-name"
            name="name"
            autoComplete="given-name"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            required
            minLength={1}
            maxLength={80}
            aria-describedby="greeting-name-hint"
          />
          <p id="greeting-name-hint">Use 1 to 80 characters. Spaces alone are invalid.</p>
          <button type="submit" disabled={!validName || greeting.isFetching}>
            Update greeting
          </button>
        </form>
        {greeting.isFetching ? <p role="status">Updating greeting…</p> : null}
        {greeting.error ? (
          <p role="alert">Greeting could not load. Try updating it again.</p>
        ) : null}
      </section>
      <section aria-labelledby="existing-information">
        <h2 id="existing-information">Existing information</h2>
        <p>This page belongs to the selected fullstack application.</p>
      </section>
    </main>
  );
}
