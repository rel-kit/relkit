import { functionSnippet, jobSnippet } from "./snippets";

export interface LandingExample {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly source: string;
  readonly guide: string;
  readonly snippet?: string;
}

export interface RenderedLandingExample extends LandingExample {
  readonly highlightedCode: string;
}

export const exampleDefinitions = [
  {
    id: "route",
    title: "HTTP Routes",
    description:
      "Map a filesystem route to a validated function without rewriting transport logic.",
    source: "templates/default/v1/api/src/routes/orders/route.ts",
    guide: "/docs/http/routes",
  },
  {
    id: "function",
    title: "Functions",
    description: "Compose cache, events, and jobs behind one schema-checked operation.",
    source: "examples/commerce/src/functions/orders/create-order.function.ts",
    guide: "/docs/fundamentals/functions",
    snippet: functionSnippet,
  },
  {
    id: "job",
    title: "Jobs",
    description: "Add retries, concurrency, scheduling, and idempotency to background work.",
    source: "examples/commerce/src/jobs/send-receipt.job.ts",
    guide: "/docs/async/jobs",
    snippet: jobSnippet,
  },
  {
    id: "agent",
    title: "Agents",
    description: "Give a model schema-checked input, allowlisted tools, and hard execution limits.",
    source: "examples/commerce/src/agents/order-support.agent.ts",
    guide: "/docs/resources-ai/agents",
  },
  {
    id: "event",
    title: "Events",
    description:
      "Publish a versioned fact while declaring payload validation and sensitive fields.",
    source: "examples/commerce/src/events/order-created.event.ts",
    guide: "/docs/async/events",
  },
  {
    id: "drizzle",
    title: "Drizzle",
    description: "Register a Drizzle schema as a checked Relkit data model backed by Bun SQLite.",
    source: "examples/commerce/src/data/application.data-model.ts",
    guide: "/docs/fundamentals/context",
  },
  {
    id: "better-auth",
    title: "Better Auth",
    description: "Mount Better Auth on a Relkit route and protect selected application paths.",
    source: "examples/commerce/src/routes/api/auth/[[...auth]]/route.ts",
    guide: "/docs/http/middleware",
  },
] as const satisfies readonly LandingExample[];

export const featuredCapabilityIds = [
  "functions",
  "http",
  "events",
  "jobs",
  "agents",
  "testing",
] as const;

export const productStages = [
  {
    number: "01",
    title: "Describe",
    copy: "Write TypeScript descriptors for functions, routes, events, jobs, resources, tools, and agents.",
    detail: "Your application code remains the source of truth.",
  },
  {
    number: "02",
    title: "Check",
    copy: "Relkit resolves conventions, schemas, providers, dependencies, and policies into one graph.",
    detail: "Invalid applications fail before a runtime starts.",
  },
  {
    number: "03",
    title: "Run everywhere",
    copy: "Development, tests, HTTP, async work, OpenAPI, clients, inspection, and deployment use that graph.",
    detail: "One model; no parallel configuration story.",
  },
] as const;

export const developerWorkflows = [
  [
    "AGENT",
    "Agents",
    "Run model workflows with typed input, allowlisted tools, approvals, and hard execution budgets.",
  ],
  [
    "TOOL",
    "AI tools",
    "Expose existing functions to models without bypassing schemas, permissions, or application context.",
  ],
  [
    "TRACE",
    "Observability and tracing",
    "Correlate requests, functions, events, jobs, logs, and spans with one graph identity.",
  ],
  [
    "VIEW",
    "Inspector application",
    "Explore routes, resources, diagnostics, logs, and traces without reading runtime internals.",
  ],
] as const;

export const observabilityFeatures = [
  {
    label: "Requests",
    title: "Follow every request",
    description:
      "Inspect the route, target function, response status, duration, and graph identity together.",
    points: ["Route and function identity", "Status and duration", "Correlated execution"],
    href: "/docs/operations/inspector",
    action: "Inspect requests",
  },
  {
    label: "Logs",
    title: "Correlate structured logs",
    description:
      "Locate logs by request and execution identity without manually joining unrelated identifiers.",
    points: ["Structured fields", "Automatic correlation", "Sensitive-field redaction"],
    href: "/docs/operations/observability",
    action: "Explore logs",
  },
  {
    label: "Traces",
    title: "Trace async work",
    description:
      "Follow spans from an HTTP request through functions, events, jobs, and provider calls.",
    points: ["Parent-child spans", "Events and jobs", "Failure location"],
    href: "/docs/operations/observability",
    action: "Explore traces",
  },
] as const;
