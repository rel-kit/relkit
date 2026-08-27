import { Command } from "effect/unstable/cli";
import { basicCommands } from "./cli-command-basic.js";
import { groupCommands } from "./cli-command-groups.js";
import { booleanFlag, document, type SelectInvocation } from "./cli-command-shared.js";

/** Builds the Effect CLI tree from the same metadata exported to documentation. */
export function createCliCommand(select: SelectInvocation) {
  const [create, dev, check, build, start, doctor] = basicCommands(select);
  const [graph, env, deploy, client] = groupCommands(select);
  return document(
    Command.make("relkit").pipe(
      Command.withSharedFlags({ json: booleanFlag([], "json") }),
      Command.withSubcommands([
        create,
        dev,
        check,
        build,
        start,
        graph,
        env,
        doctor,
        deploy,
        client,
      ]),
    ),
    [],
  );
}
