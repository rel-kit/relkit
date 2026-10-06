import { Command } from "effect/cli";
import { basicCommands } from "./cli-command-basic.js";
import { addCommand } from "./cli-command-add.js";
import { groupCommands } from "./cli-command-groups.js";
import { booleanFlag, document, type SelectInvocation } from "./cli-command-shared.js";

/** Builds the pure parser tree from the metadata exported to documentation.
 * @param select - Synchronous callback recording the parsed invocation.
 * @returns The typed root command; construction acquires no application services.
 */
export function createCliCommand(select: SelectInvocation) {
  const [create, dev, check, build, start, doctor] = basicCommands(select);
  const [graph, env, deploy, client, local, jobs] = groupCommands(select);
  const add = addCommand(select);
  return document(
    Command.make("relkit").pipe(
      Command.withSharedFlags({ json: booleanFlag([], "json") }),
      Command.withSubcommands([
        create,
        add,
        dev,
        check,
        build,
        start,
        graph,
        env,
        local,
        doctor,
        deploy,
        client,
        jobs,
      ]),
    ),
    [],
  );
}
