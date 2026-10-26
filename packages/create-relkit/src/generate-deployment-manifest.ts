/** Updates only explicitly selected deployment/jobs dependency and script fields through the generator's captured filesystem authority. */

import { join } from "node:path";
import { Effect, Schema } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { GeneratorFileSystem } from "./generator-filesystem.js";
import { GenerateProjectError } from "./generate-types.js";
import { domainError, domainTry } from "./generator-errors.js";
import { TemplateManifest, JsonObject } from "./project-manifest.schemas.js";
import type { CreateOptions } from "./options.js";
import { buildCatalogProvider } from "./build-catalog.js";

/** Applies the original validated manifest patch while preserving unrelated native JSON fields.
 * @param root - Owned staged project root.
 * @param options - Original explicit creation flags; no provider is acquired.
 * @returns Completion after deterministic bytes and original mode are published.
 */
export const customizeDeploymentManifestEffect = Effect.fn(
  "ProjectFiles.customizeDeploymentManifest",
)(
  function* (root: string, options: CreateOptions) {
    const manifestPath = join(root, "package.json");
    const fs = yield* GeneratorFileSystem;
    const source = yield* fs.readText(manifestPath);
    const parsed = yield* domainTry(() => JSON.parse(source));
    const decoded = yield* Schema.decodeUnknownEffect(TemplateManifest)(parsed).pipe(
      Effect.mapError(domainError),
    );
    const original = yield* Schema.decodeUnknownEffect(JsonObject)(parsed).pipe(
      Effect.mapError(domainError),
    );
    const manifest = {
      ...original,
      ...decoded,
      dependencies: { ...decoded.dependencies },
      scripts: { ...decoded.scripts },
    };
    const version = manifest.dependencies["@relkit/app"];
    if (version === undefined)
      return yield* Effect.fail(
        domainError(
          new GenerateProjectError(
            "RELKIT_CREATE_TEMPLATE_INVALID",
            "Template has no @relkit/app dependency.",
          ),
        ),
      );
    const providers: string[] = [];
    if (options.cloud === "aws") providers.push("@relkit/aws");
    if (options.deploy === "pulumi") providers.push("@relkit/pulumi");
    if (options.jobs !== undefined) {
      providers.push(
        "@relkit/docker",
        "@relkit/local",
        `@relkit/${options.jobs.replace(/-docker$/u, "")}`,
      );
    }
    for (const provider of providers)
      manifest.dependencies[provider] = yield* domainTry(() => buildCatalogProvider(provider));
    if (options.cloud === "aws" && options.deploy === "pulumi") {
      manifest.scripts["deploy:preview"] = "relkit deploy preview";
      manifest.scripts.deploy = "relkit deploy up";
    }
    manifest.scripts = sorted(manifest.scripts);
    manifest.dependencies = sorted(manifest.dependencies);
    yield* fs.write(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    yield* fs.chmod(manifestPath, 0o644);
  },
  (effect) => observeExecution("generator", "generation.deploymentManifest", effect),
);

/**
 * Sorts owned manifest fields deterministically.
 * @param values - Ordered declarations or argument values.
 * @returns A new manifest string record sorted by key.
 */
function sorted(values: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values).sort(([left], [right]) => left.localeCompare(right)),
  );
}
