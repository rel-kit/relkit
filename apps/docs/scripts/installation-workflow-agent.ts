/** Verifies the native first-agent guide from a fresh packed minimal project with an offline model. */
import { Effect } from "effect";
import { agentForbiddenPackages } from "./installation-workflow-guidance.js";
import {
  createWorkflowProject,
  copyWorkflowSource,
  installWorkflowGuide,
  workflowCommand,
  verifyWorkflowClosure,
} from "./installation-workflow-project.js";
import type { InstallationWorkflow } from "./installation-workflows.types.js";

/** Copies exactly the first-agent guide's backend files and executes its deterministic native model test.
 * @param context - Exact packed cohort.
 * @returns Completion after native execution, check and typecheck without model credentials.
 */
export const agentWorkflow = Effect.fn("DocsInstallation.agent")(function* (
  context: InstallationWorkflow,
) {
  const app = yield* createWorkflowProject(context, "agent");
  yield* installWorkflowGuide(context, app, "agent");
  const paths = [
    "relkit.config.ts",
    "src/services/hello/functions/hello.function.ts",
    "src/services/hello/tools/lookup.tool.ts",
    "src/services/hello/agents/assistant.agent.ts",
    "tests/unit/assistant.agent.test.ts",
  ];
  yield* Effect.forEach(
    paths,
    (path) => copyWorkflowSource(context, app, `templates/default/v1/agent/${path}`, path),
    { concurrency: 1 },
  );
  yield* Effect.forEach(
    [
      ["run", "check"],
      ["run", "typecheck"],
      ["test", "tests/unit/assistant.agent.test.ts"],
    ],
    (args) => workflowCommand(context, app, args),
    { concurrency: 1 },
  );
  yield* verifyWorkflowClosure(context, app, agentForbiddenPackages);
});
