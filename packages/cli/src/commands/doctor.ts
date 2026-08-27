import { CLI_EXIT_CODES, type CliCommandContext } from "../main-support.js";
import {
  DoctorCommandError,
  doctorProject,
  formatDoctor,
  parseDoctorArgs,
  type DoctorOptions,
} from "./doctor-support.js";

export * from "./doctor-support.js";

/** Runs prerequisite checks through the shared CLI reporter. */
export async function runDoctor(
  args: readonly string[],
  context: Pick<CliCommandContext, "json" | "reporter">,
  options: DoctorOptions = {},
): Promise<number> {
  try {
    const parsed = parseDoctorArgs(args);
    const result = await doctorProject({ ...options, ...parsed });
    context.reporter.output(result, formatDoctor(result));
    return result.ok ? CLI_EXIT_CODES.success : CLI_EXIT_CODES.failure;
  } catch (error) {
    const code = error instanceof DoctorCommandError ? error.code : "RELKIT_DOCTOR_FAILED";
    context.reporter.error(code, error instanceof Error ? error.message : String(error));
    return code === "RELKIT_DOCTOR_USAGE" ? CLI_EXIT_CODES.usage : CLI_EXIT_CODES.failure;
  }
}
