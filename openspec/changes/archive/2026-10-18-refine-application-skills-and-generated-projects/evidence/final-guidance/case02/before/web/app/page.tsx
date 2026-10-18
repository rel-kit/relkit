"use client";

import { useRoute } from "@relkit/client/react";

export default function Page() {
  const greeting = useRoute("route.get.hello", { input: { name: "Relkit" } });

  return (
    <main>
      <h1>{greeting.data?.message ?? "Loading greeting…"}</h1>
      <section aria-labelledby="existing-information">
        <h2 id="existing-information">Existing information</h2>
        <p>This page belongs to the selected fullstack application.</p>
      </section>
    </main>
  );
}
