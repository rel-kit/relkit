import { normalizeAddRequest } from "./add-options.js";
import { usage } from "./add-options-parser.js";
import { resolveDomainOptions } from "./add-resolver-domain.js";
import { resolvePlatformOptions } from "./add-resolver-platform.js";
import { resolveResourceOptions } from "./add-resolver-resources.js";
import { resolveServiceForKind } from "./add-resolution-discovery.js";
import { AddResolutionState, choices } from "./add-resolution-state.js";
import { ADD_KINDS, type AddRequest } from "./add-types.js";
import { discoverProject } from "./project-discovery.js";
import { createClackPromptDriver, type PromptDriver } from "./prompt-driver.js";

export interface ResolveAddContext {
  readonly cwd?: string;
  readonly interactive?: boolean;
  readonly promptDriver?: PromptDriver;
}

export interface ResolvedAddRequest {
  readonly request: AddRequest;
  readonly prompted: boolean;
}

export async function resolveAddRequest(
  args: readonly string[],
  context: ResolveAddContext = {},
): Promise<AddRequest> {
  return (await resolveAddRequestDetails(args, context)).request;
}

export async function resolveAddRequestDetails(
  args: readonly string[],
  context: ResolveAddContext = {},
): Promise<ResolvedAddRequest> {
  const interactive = context.interactive === true;
  const prompt = interactive ? (context.promptDriver ?? createClackPromptDriver()) : undefined;
  const input = [...args];
  let prompted = false;
  if (!ADD_KINDS.includes(input[0] as (typeof ADD_KINDS)[number])) {
    if (!interactive || !prompt) usage("Usage: relkit add <kind> [name] [options]");
    const kind = await prompt.select({
      message: "What would you like to add?",
      options: choices(ADD_KINDS),
    });
    input.unshift(kind);
    prompted = true;
  }
  const state = new AddResolutionState(input, context.cwd, interactive, prompt);
  const discovery = await discoverProject(state.parsed.projectRoot);
  await resolveServiceForKind(state, discovery);
  await resolveDomainOptions(state, discovery);
  await resolveResourceOptions(state, discovery);
  await resolvePlatformOptions(state, discovery);
  const normalizeContext = context.cwd === undefined ? {} : { cwd: context.cwd };
  return Object.freeze({
    request: normalizeAddRequest(state.args, normalizeContext),
    prompted: prompted || state.prompted,
  });
}
