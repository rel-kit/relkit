import type { Ref } from "./id.js";

export interface SchemaTypeParameters<Input = unknown, Output = Input> {
  readonly input: Input;
  readonly output: Output;
}

/** Structural schema shape used by browser-safe references. */
export interface SchemaLike<Input = unknown, Output = Input> {
  readonly "~standard": {
    readonly types?: SchemaTypeParameters<Input, Output>;
  };
}

export type SchemaInput<S> = S extends {
  readonly "~standard": { readonly types?: SchemaTypeParameters<infer Input, unknown> };
}
  ? Input
  : unknown;

export type SchemaOutput<S> = S extends {
  readonly "~standard": { readonly types?: SchemaTypeParameters<unknown, infer Output> };
}
  ? Output
  : unknown;

export interface TaskRef<
  Id extends string = string,
  InputSchema = unknown,
  OutputSchema = unknown,
  Errors extends readonly unknown[] = readonly unknown[],
> {
  readonly ref: Ref<"task", Id>;
  readonly input: InputSchema;
  readonly output: OutputSchema;
  readonly errors?: Errors;
}

export type TaskRefAny = TaskRef;

export interface JobRef<
  Id extends string = string,
  InputSchema = unknown,
  OutputSchema = unknown,
  Task extends TaskRef = TaskRef,
> {
  readonly ref: Ref<"job", Id>;
  readonly input: InputSchema;
  readonly output?: OutputSchema;
  readonly task?: Task;
  readonly name?: string;
  readonly profile?: string;
}

export type JobRefAny = JobRef;
