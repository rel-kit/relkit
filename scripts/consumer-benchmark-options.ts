/**
 * Resolves explicit benchmark selections without installing tools or starting
 * work. Defaults target baseline evidence and the pinned Bun layout; expensive
 * fixtures can be narrowed while every omitted matrix row remains incomplete.
 */
import { resolve } from "node:path";
import type { ConsumerBenchmarkOptions } from "./consumer-benchmark.types.js";

/**
 * Reads a required value following one command-line option.
 * @param args - Literal executable arguments.
 * @param name - Option requiring a non-option value.
 * @returns Its value, or undefined when the option is omitted.
 * @throws When the option is present without a value.
 */
function option(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) throw new Error(`Missing value: ${name}`);
  return value;
}

/**
 * Resolves the measurement scope without inferring manager choice from runners.
 * @param args - Literal benchmark arguments.
 * @param repository - Intended checkout containing the authoritative producers.
 * @returns Validated finite benchmark options.
 * @throws When the stage or installed manager selection is unsupported.
 */
export function consumerBenchmarkOptions(
  args: readonly string[],
  repository: string,
): ConsumerBenchmarkOptions {
  const stage = option(args, "--stage") ?? "baseline";
  if (stage !== "baseline" && stage !== "1" && stage !== "final")
    throw new Error(`Unsupported stage: ${stage}`);
  const manager = option(args, "--manager") ?? "bun";
  if (manager !== "bun" && manager !== "bun-isolated" && manager !== "npm" && manager !== "pnpm")
    throw new Error(`Unsupported manager: ${manager}`);
  const artifacts = option(args, "--artifacts");
  return {
    stage,
    repository,
    manager,
    output: resolve(
      option(args, "--output") ?? `${repository}/docs/evidence/lean-install/${stage}.json`,
    ),
    inventoryOnly: args.includes("--inventory-only"),
    retainInstallations: args.includes("--retain-installations"),
    fixtures: option(args, "--fixtures")?.split(",") ?? [],
    ...(artifacts === undefined ? {} : { artifacts: resolve(artifacts) }),
  };
}
