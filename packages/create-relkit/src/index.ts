#!/usr/bin/env bun
import { spinner } from "@clack/prompts";
import { generateProject } from "./generate.js";
import { formatGenerateResult } from "./generate-output.js";
import { formatCreatePlan, planCreate } from "./create-preview.js";
import { resolveCreateOptionsDetails } from "./create-resolver.js";
import { createClackPromptDriver } from "./prompt-driver.js";

export * from "./options.js";
export * from "./add-types.js";
export * from "./add-name.js";
export * from "./add-options.js";
export * from "./project-discovery-types.js";
export * from "./project-discovery.js";
export * from "./source-edit.js";
export * from "./add-transaction.js";
export * from "./scaffold-catalog.js";
export * from "./plan-builder.js";
export * from "./add-plan.js";
export * from "./add-output.js";
export * from "./add-resolver.js";
export * from "./prompt-driver.js";
export * from "./create-resolver.js";
export * from "./create-preview.js";
export * from "./template-root.js";
export * from "./render-database.js";
export * from "./validate.js";
export * from "./generate.js";
export * from "./generate-types.js";
export * from "./generate-output.js";

if (import.meta.main) {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const interactive = !json && !process.env.CI && process.stdin.isTTY === true;
  const promptDriver = interactive ? createClackPromptDriver("RELKIT_CREATE_CANCELLED") : undefined;
  const progress = interactive ? spinner() : undefined;
  let progressStarted = false;
  try {
    promptDriver?.intro("Create a RELKIT app");
    const resolved = await resolveCreateOptionsDetails(args, {
      json,
      interactive,
      ...(promptDriver ? { promptDriver } : {}),
    });
    const plan = await planCreate(resolved.options);
    if (!json) {
      if (promptDriver) promptDriver.note(formatCreatePlan(plan), "Planned project");
      else process.stderr.write(`${formatCreatePlan(plan)}\n`);
    }
    if (
      resolved.prompted &&
      promptDriver &&
      !(await promptDriver.confirm({
        message: "Create this project?",
        initialValue: true,
      }))
    )
      throw Object.assign(new Error("Scaffolding was cancelled."), {
        code: "RELKIT_CREATE_CANCELLED",
        exitCode: 130,
      });
    const result = await generateProject(resolved.options, {
      interactive,
      ...(promptDriver ? { promptDriver } : {}),
      ...(progress
        ? {
            onProgress: (message: string) => {
              if (message.startsWith("Creating a new RELKIT app")) return;
              if (!progressStarted) {
                progress.start(message);
                progressStarted = true;
              } else progress.message(message);
            },
          }
        : {}),
    });
    if (progressStarted) progress?.stop("Project created.");
    process.stdout.write(`${json ? JSON.stringify(result) : formatGenerateResult(result)}\n`);
  } catch (error) {
    if (progressStarted) progress?.error("Project creation failed.");
    const code =
      error instanceof Error && "code" in error && typeof error.code === "string"
        ? error.code
        : "RELKIT_CREATE_FAILED";
    const message = error instanceof Error ? error.message : String(error);
    const output = json
      ? JSON.stringify({ ok: false, error: { code, message } })
      : `${code}: ${message}`;
    (json ? process.stdout : process.stderr).write(`${output}\n`);
    process.exitCode =
      error instanceof Error && "exitCode" in error && typeof error.exitCode === "number"
        ? error.exitCode
        : code === "RELKIT_CREATE_USAGE"
          ? 2
          : 1;
  }
}
