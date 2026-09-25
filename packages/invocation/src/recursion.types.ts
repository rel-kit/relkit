/** One immutable function invocation on a call path.
 * The optional invocation ID identifies a concrete call of the function.
 * @example const frame: InvocationCallFrame = { functionId: "tasks.run" };
 */
export interface InvocationCallFrame {
  readonly functionId: string;
  readonly invocationId?: string;
}
