import { Effect } from "effect";
import {
  renderTypeApplicationEffect,
  renderTypeIntersectionEffect,
  renderTypeObjectEffect,
  renderTypePropertyEffect,
} from "./generate-type-syntax.js";
/** Renders a typed job procedure with its query or mutation marker.
 * @param input - Rendered input type.
 * @param output - Rendered output type.
 * @param error - Rendered error type.
 * @param operation - The oRPC operation kind.
 * @returns An Effect yielding a job procedure contract type.
 * @example Effect.runSync(jobProcedureContractEffect("Input", "Output", "never", "query"));
 */
export const jobProcedureContractEffect = Effect.fnUntraced(function* (
  input: string,
  output: string,
  error: string,
  operation: "mutation" | "query",
) {
  return yield* renderTypeIntersectionEffect(
    yield* renderTypeApplicationEffect('import("@relkit/client/jobs").JobProcedureContract', [
      input,
      output,
      error,
    ]),
    yield* renderTypeObjectEffect([
      yield* renderTypePropertyEffect("operation", JSON.stringify(operation)),
    ]),
  );
});
/** Renders a typed job stream procedure with its query marker.
 * @param input - Rendered input type.
 * @param output - Rendered stream frame type.
 * @param error - Rendered error type.
 * @param operation - The oRPC operation kind.
 * @returns An Effect yielding a job stream contract type.
 * @example Effect.runSync(jobStreamProcedureContractEffect("Input", "Frame", "never", "query"));
 */
export const jobStreamProcedureContractEffect = Effect.fnUntraced(function* (
  input: string,
  output: string,
  error: string,
  operation: "query",
) {
  return yield* renderTypeIntersectionEffect(
    yield* renderTypeApplicationEffect('import("@relkit/client/jobs").JobStreamProcedureContract', [
      input,
      output,
      error,
    ]),
    yield* renderTypeObjectEffect([
      yield* renderTypePropertyEffect("operation", JSON.stringify(operation)),
    ]),
  );
});
