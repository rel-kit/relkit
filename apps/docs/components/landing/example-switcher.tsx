"use client";

import Link from "next/link";
import { useState } from "react";
import type { RenderedLandingExample } from "./data";

function RouteResponsePreview() {
  return (
    <figure className="landing-route-preview" aria-label="POST /orders returns 201 Created">
      <div className="landing-browser-toolbar">
        <span aria-hidden="true">● ● ●</span>
        <code>localhost:3000/orders</code>
      </div>
      <div className="landing-browser-body">
        <div className="landing-browser-request">
          <strong>POST</strong>
          <code>/orders</code>
        </div>
        <div className="landing-browser-status">
          <span>201</span>
          <strong>Created</strong>
        </div>
        <pre>{`{
  "orderId": "order-123",
  "sku": "book",
  "totalCents": 200
}`}</pre>
        <figcaption>Validated JSON response</figcaption>
      </div>
    </figure>
  );
}

export function ExampleSwitcher({
  examples,
}: {
  readonly examples: readonly RenderedLandingExample[];
}) {
  const [selected, setSelected] = useState(0);
  const example = examples[selected]!;
  return (
    <div className="landing-example-shell">
      <div className="landing-example-tabs" aria-label="Executable Relkit examples">
        {examples.map((item, index) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={selected === index}
            onClick={() => setSelected(index)}
          >
            <strong>{item.title}</strong>
          </button>
        ))}
      </div>
      <div className="landing-code-panel" aria-live="polite">
        <div className="landing-code-header">
          <div>
            <strong>{example.title}</strong>
            <small>{example.description}</small>
          </div>
          <Link href={example.guide}>Read the guide →</Link>
        </div>
        <div
          key={example.id}
          className={
            example.id === "route"
              ? "landing-code-content landing-code-content-with-preview"
              : "landing-code-content"
          }
        >
          <div dangerouslySetInnerHTML={{ __html: example.highlightedCode }} />
          {example.id === "route" ? <RouteResponsePreview /> : null}
        </div>
      </div>
    </div>
  );
}
