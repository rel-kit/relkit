import type { ErrorDescriptorAny } from "./define-error.js";

export interface FunctionFailure<Error extends globalThis.Error = globalThis.Error> {
  readonly _tag: "FunctionFailure";
  readonly error: Error;
}

/** Structural Effect shape used without making Effect a required dependency. */
export interface FunctionEffectValue<Output = unknown, Error = unknown, Requirements = unknown> {
  readonly "~effect/Effect": {
    readonly _A: (_: never) => Output;
    readonly _E: (_: never) => Error;
    readonly _R: (_: never) => Requirements;
  };
  readonly pipe: (...args: never[]) => unknown;
  readonly [Symbol.iterator]: () => unknown;
}

export type DeclaredErrorOf<Descriptor extends ErrorDescriptorAny> = ReturnType<
  Descriptor["create"]
>;

export type DeclaredErrorsOf<Descriptors extends readonly ErrorDescriptorAny[]> =
  Descriptors[number] extends infer Descriptor
    ? Descriptor extends ErrorDescriptorAny
      ? DeclaredErrorOf<Descriptor>
      : never
    : never;

export type FunctionHandlerResult<
  Output,
  Errors extends readonly ErrorDescriptorAny[] = readonly ErrorDescriptorAny[],
> =
  | Output
  | DeclaredErrorsOf<Errors>
  | FunctionFailure<DeclaredErrorsOf<Errors>>
  | FunctionEffectValue<Output, DeclaredErrorsOf<Errors>, never>;

type EffectChannels<Value> = Value extends { readonly "~effect/Effect": infer Channels }
  ? Channels
  : never;

type EffectChannelValue<Value> = Value extends (_: never) => infer Result ? Result : never;

type EffectOutput<Value> =
  EffectChannels<Value> extends { readonly _A: infer Channel }
    ? EffectChannelValue<Channel>
    : never;

type EffectError<Value> =
  EffectChannels<Value> extends { readonly _E: infer Channel }
    ? EffectChannelValue<Channel>
    : never;

type EffectRequirements<Value> =
  EffectChannels<Value> extends { readonly _R: infer Channel }
    ? EffectChannelValue<Channel>
    : never;

type ReturnedErrors<Result> = Result extends unknown
  ? Result extends FunctionFailure<infer Error>
    ? Error
    : Result extends FunctionEffectValue
      ? EffectError<Result>
      : Result extends globalThis.Error
        ? Result
        : never
  : never;

type InvalidHandlerResult<Result, Output, AllowedError> = unknown extends Result
  ? never
  : Result extends FunctionFailure<infer Error>
    ? Exclude<Error, AllowedError> extends never
      ? never
      : "undeclared function error"
    : Result extends FunctionEffectValue
      ? [EffectChannels<Result>] extends [never]
        ? "Effect return type is not readable"
        : [EffectOutput<Result>] extends [Output]
          ? Exclude<EffectError<Result>, AllowedError> extends never
            ? [EffectRequirements<Result>] extends [never]
              ? never
              : "Effect requirements must be provided by ZSYS"
            : "undeclared Effect error"
          : "Effect output does not match the output schema"
      : Result extends globalThis.Error
        ? Exclude<Result, AllowedError> extends never
          ? never
          : "undeclared function error"
        : Result extends Output
          ? never
          : "handler return does not match the output schema";

type MissingDeclaredErrors<Result, Errors extends readonly ErrorDescriptorAny[]> = Exclude<
  DeclaredErrorsOf<Errors>,
  ReturnedErrors<Awaited<Result>>
>;

export type FunctionHandlerValidation<
  Result,
  Output,
  Errors extends readonly ErrorDescriptorAny[],
> = [InvalidHandlerResult<Awaited<Result>, Output, DeclaredErrorsOf<Errors>>] extends [never]
  ? [MissingDeclaredErrors<Result, Errors>] extends [never]
    ? {}
    : {
        readonly __zsys_handler_error__: "Return every error declared in the function's errors list";
      }
  : {
      readonly __zsys_handler_error__: "Return values and errors must match the function contract";
    };

/** Returns a typed application failure from a plain function handler. */
export function fail<const Descriptor extends ErrorDescriptorAny>(
  descriptor: Descriptor,
  data: Parameters<Descriptor["create"]>[0],
): FunctionFailure<DeclaredErrorOf<Descriptor>> {
  const error = descriptor.create(data) as DeclaredErrorOf<Descriptor>;
  return Object.freeze({ _tag: "FunctionFailure" as const, error });
}
