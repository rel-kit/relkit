export interface LandingExample {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly source: string;
  readonly guide: string;
}

export interface RenderedLandingExample extends LandingExample {
  readonly highlightedCode: string;
}

export const exampleDefinitions = [
  {
    id: "service",
    title: "Service",
    description: "Organize a domain around one focused public boundary.",
    source: "examples/commerce/src/orders/service.ts",
    guide: "/docs/service",
  },
  {
    id: "route",
    title: "Routes",
    description: "Map HTTP requests to a service's validated functions.",
    source: "examples/commerce/src/routes/orders/route.ts",
    guide: "/docs/http/routes",
  },
  {
    id: "function",
    title: "Functions",
    description: "Run schema-checked business logic with explicit dependencies.",
    source: "examples/commerce/src/orders/functions/create-order.function.ts",
    guide: "/docs/fundamentals/functions",
  },
  {
    id: "event",
    title: "Events",
    description: "Define typed facts that independent functions can publish and consume.",
    source: "apps/docs/examples/events/order-created.event.ts",
    guide: "/docs/events",
  },
  {
    id: "observability",
    title: "Observability",
    description: "Keep complete redacted local evidence before sampling Sentry and OTLP exports.",
    source: "apps/docs/examples/landing/telemetry.ts",
    guide: "/docs/operations/observability",
  },
] as const satisfies readonly LandingExample[];

export const primaryCapabilities = [
  {
    id: "service",
    title: "Service",
    summary: "Organize functions and resources behind a focused domain boundary.",
    guide: "service",
  },
  {
    id: "routes",
    title: "Routes",
    summary: "Expose service functions through explicit, validated HTTP mappings.",
    guide: "http",
  },
  {
    id: "functions",
    title: "Functions",
    summary: "Write transport-independent business logic with checked input and output.",
    guide: "fundamentals/functions",
  },
  {
    id: "events",
    title: "Events",
    summary: "Publish typed facts and process them with independent functions.",
    guide: "events",
  },
  {
    id: "observability",
    title: "Observability",
    summary: "Correlate requests, logs, spans, events, and failures in one timeline.",
    guide: "operations/observability",
  },
] as const;

export const productStages = [
  {
    number: "01",
    title: "Describe",
    copy: "Write TypeScript descriptors and bind only the integrations your application needs.",
    detail: "Your application code remains the source of truth.",
  },
  {
    number: "02",
    title: "Check",
    copy: "Relkit resolves schemas, profiles, local recipes, dependencies, and policies into one graph.",
    detail: "Invalid applications fail before a runtime starts.",
  },
  {
    number: "03",
    title: "Run everywhere",
    copy: "Development, explicit test replacements, inspection, and deployment use that graph.",
    detail: "One model; no parallel configuration story.",
  },
] as const;

export const developerWorkflows = [
  [
    "LOCAL",
    "Docker overlays",
    "Start pinned Redis and MinIO recipes only for graph-required bindings, with project-scoped state.",
  ],
  [
    "BIND",
    "Mixed ownership",
    "Combine connected services with infrastructure-owned AWS resources without environment branches.",
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
      "Keep complete bounded local logs before minimum-level filtering sends records to exporters.",
    points: ["Structured fields", "Automatic correlation", "Redaction before persistence"],
    href: "/docs/operations/observability",
    action: "Explore logs",
  },
  {
    label: "Traces",
    title: "Trace async work",
    description:
      "Follow complete local spans even when root-consistent sampling omits a remote trace.",
    points: ["Parent-child spans", "Exporter health", "Failure isolation"],
    href: "/docs/operations/observability",
    action: "Explore traces",
  },
] as const;
