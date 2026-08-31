import type { ApiPackage } from "./documentation-catalog.js";

export const aiGuideGroup = {
  directory: "ai",
  title: "AI",
  icon: "Bot",
  pages: ["index", "agents", "tools", "function-tools", "mcp", "approvals", "first-agent"],
} as const;

export const aiGuideRelations = aiGuideGroup.pages.map((page) => ({
  path: `ai/${page}`,
  api: ["agents", "tools", "functions", "testing"] satisfies readonly ApiPackage[],
  examples: [
    "templates/default/v1/agent/src/hello/agents/assistant.agent.ts",
    "templates/default/v1/agent/src/hello/tools/lookup.tool.ts",
  ],
}));
