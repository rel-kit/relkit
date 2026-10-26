/** Keeps client topics, frontend tasks, and backend-to-frontend reference links with their maintained examples. */
import type { ApiPackage } from "./documentation-catalog.js";
export const clientGuideGroup = {
  directory: "docs/modules/client",
  title: "Typed Client",
  icon: "PanelsTopLeft",
  pages: [
    "index",
    "transports",
    "authentication",
    "routes",
    "mutations",
    "streams",
    "ssr",
    "offline",
    "build-integration",
  ],
} as const;

const clientExamples = {
  index: "apps/docs/examples/frontend/app.tsx",
  transports: "apps/docs/examples/frontend/rpc.ts",
  routes: "apps/docs/examples/frontend/app.tsx",
  mutations: "apps/docs/examples/frontend/echo.tsx",
  streams: "apps/docs/examples/frontend/report.tsx",
  ssr: "apps/docs/examples/frontend/ssr.ts",
  authentication: "apps/docs/examples/frontend/auth-provider.tsx",
  offline: "apps/docs/examples/jobs/reconcile-unknown.ts",
  "build-integration": "apps/docs/examples/frontend/vite.config.ts",
} as const;

export const clientGuideRelations = clientGuideGroup.pages.map((page) => ({
  path: `docs/modules/client/${page}`,
  api: ["client", "routes"] satisfies readonly ApiPackage[],
  examples: [clientExamples[page]],
}));

export const frontendGuideGroup = {
  directory: "guides/frontend",
  title: "Frontend",
  icon: "PanelsTopLeft",
  pages: ["connect-react"],
} as const;

export const frontendGuideRelation = {
  path: "guides/frontend/connect-react",
  api: ["client", "routes", "functions"] satisfies readonly ApiPackage[],
  examples: [
    "apps/docs/examples/frontend/app.tsx",
    "apps/docs/examples/frontend/vite.config.ts",
    "apps/docs/examples/frontend/next.config.ts",
    "apps/docs/examples/frontend/next-page.tsx",
  ],
};

export const frontendUsage = [
  {
    packages: ["routes"],
    title: "Call a defined route",
    href: "/docs/modules/http/define#use-from-the-frontend",
  },
  {
    packages: ["services", "functions"],
    title: "Call a public service operation",
    href: "/docs/modules/service/routes#use-from-the-frontend",
  },
  {
    packages: ["jobs"],
    title: "Trigger and observe a job",
    href: "/docs/modules/jobs/clients#use-from-react",
  },
  {
    packages: ["agents", "integrations/langchain"],
    title: "Observe an agent and send controls",
    href: "/docs/modules/ai/streaming#use-from-the-frontend",
  },
  { packages: ["realtime"], title: "Subscribe to a channel", href: "/docs/modules/realtime/react" },
  {
    packages: ["better-auth"],
    title: "Sign in from the browser",
    href: "/docs/modules/auth/clients",
  },
  {
    packages: ["client"],
    title: "Connect a React frontend",
    href: "/guides/frontend/connect-react",
  },
] satisfies readonly { packages: readonly ApiPackage[]; title: string; href: string }[];
