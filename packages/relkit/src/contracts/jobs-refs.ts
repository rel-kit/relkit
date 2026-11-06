import type { Ref } from "./id.js";

/** Standard Schema type parameters captured by a browser-safe reference. */
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

/** Input type inferred from a structural Standard Schema reference. */
export type SchemaInput<S> = S extends {
  readonly "~standard": { readonly types?: SchemaTypeParameters<infer Input, unknown> };
}
  ? Input
  : unknown;

/** Output type inferred from a structural Standard Schema reference. */
export type SchemaOutput<S> = S extends {
  readonly "~standard": { readonly types?: SchemaTypeParameters<unknown, infer Output> };
}
  ? Output
  : unknown;

/** Browser-safe reference to a task and its input, output, and errors. */
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

/** Task reference with unconstrained type parameters. */
export type TaskRefAny = TaskRef;

/** Browser-safe reference to a job and its underlying task. */
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

/** Job reference with unconstrained type parameters. */
export type JobRefAny = JobRef;
