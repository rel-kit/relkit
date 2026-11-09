import type {
  ErrorDescriptorAny,
  FunctionDependencies,
  FunctionHandlerValidation,
} from "../functions/index.js";
import type { EventInputByName, EventName } from "./event-registry.js";
import type { DefineEventFunctionOptions, EventFunctionContext } from "./event-function.types.js";
export type { ErrorDescriptorAny, FunctionDependencies } from "../functions/index.js";
export type { EventName } from "./event-registry.js";
export type {
  EventFunctionDescriptor,
  EventFunctionDescriptorAny,
} from "./event-function.types.js";

/** Error declarations inferred from a function definition.
 * @example type Errors = ErrorListOf<typeof options>
 */
export type ErrorListOf<Options> = Options extends {
  readonly errors: infer Errors extends readonly ErrorDescriptorAny[];
}
  ? Errors
  : readonly [];

/** Handler-aware options for an event function definition.
 * @example type Options = EventFunctionCallOptions<"receipt.send", "orders.created", [], {}>
 */
export type EventFunctionCallOptions<
  Id extends string,
  Event extends EventName,
  Dependencies extends FunctionDependencies,
> = Omit<
  DefineEventFunctionOptions<Id, Event, Dependencies, readonly ErrorDescriptorAny[]>,
  "handler"
> & {
  readonly handler: (
    input: EventInputByName<Event>,
    context: EventFunctionContext<Event, Dependencies>,
  ) => unknown;
};

/** Validates a handler's result against declared errors and void success.
 * @example type Validation = EventFunctionValidation<typeof options>
 */
export type EventFunctionValidation<
  Options extends { readonly handler: (...args: never[]) => unknown },
> = FunctionHandlerValidation<Awaited<ReturnType<Options["handler"]>>, void, ErrorListOf<Options>>;
