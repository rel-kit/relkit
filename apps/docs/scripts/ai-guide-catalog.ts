/** Defines AI guide ordering and source-backed relations to grouped agent/tool examples as pure catalog data. */
import type { ApiPackage } from "./documentation-catalog.js";

export const aiGuideGroup = {
  directory: "docs/modules/ai",
  title: "AI",
  icon: "Bot",
  pages: [
    "index",
    "tools",
    "function-tools",
    "agents",
    "native-runtime",
    "graphs-persistence",
    "streaming",
    "threads-recovery",
    "approvals",
    "mcp",
  ],
} as const;

export const aiGuideRelations = aiGuideGroup.pages.map((page) => ({
  path: `docs/modules/ai/${page}`,
  api: [
    "agents",
    "integrations/langchain",
    "tools",
    "functions",
    "testing",
  ] satisfies readonly ApiPackage[],
  examples: [
    "templates/default/v1/agent/src/services/hello/agents/assistant.agent.ts",
    "templates/default/v1/agent/src/services/hello/tools/lookup.tool.ts",
  ],
}));
