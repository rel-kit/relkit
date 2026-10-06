import type { Option } from "effect";
import type { Argument, Flag } from "effect/cli";

/** Pure parser selection callback; command execution remains at the dispatcher edge. */
export type SelectInvocation = (command: string, args: readonly string[]) => void;

/** Dynamic add metadata can describe either positional arguments or named flags. */
export type AddParameter = Argument.Argument<unknown> | Flag.Flag<unknown>;

/** All simple jobs options parse optional literal strings without hidden authority. */
export type OptionalStringFlag = Flag.Flag<Option.Option<string>>;
