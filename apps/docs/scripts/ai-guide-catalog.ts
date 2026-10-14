/** Defines AI guide ordering and source-backed relations to grouped agent/tool examples as pure catalog data. */
import type { ApiPackage } from "./documentation-catalog.js";

export const aiGuideGroup = {
  directory: "ai",
  title: "AI",
  icon: "Bot",
  pages: [
    "index",
    "agents",
    "native-runtime",
    "graphs-persistence",
    "streaming",
    "threads-recovery",
    "approvals",
    "tools",
    "function-tools",
    "mcp",
    "first-agent",
  ],
} as const;

export const aiGuideRelations = aiGuideGroup.pages.map((page) => ({
  path: `ai/${page}`,
  api: ["agents", "tools", "functions", "testing"] satisfies readonly ApiPackage[],
  examples: [
    "templates/default/v1/agent/src/services/hello/agents/assistant.agent.ts",
    "templates/default/v1/agent/src/services/hello/tools/lookup.tool.ts",
  ],
}));
