/** Validates exact candidate archive authority before constructing a runtime-only image install. */
import { Schema } from "effect";

const archive = Schema.Struct({
  name: Schema.String.check(Schema.isPattern(/^(?:@relkit\/[a-z0-9-]+|relkit|create-relkit)$/)),
  version: Schema.String.check(Schema.isPattern(/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/)),
  file: Schema.String.check(Schema.isPattern(/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.tgz$/)),
  sha256: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)),
});
const input = Schema.Struct({ packages: Schema.Array(archive).check(Schema.isMaxLength(128)) });

export function inspectorImageInput(value: Schema.Json) {
  const { packages } = Schema.decodeUnknownSync(input)(value);
  if (
    new Set(packages.map((item) => item.name)).size !== packages.length ||
    new Set(packages.map((item) => item.file)).size !== packages.length
  )
    throw new TypeError("Duplicate image candidate archive identity");
  const tool = packages.find((item) => item.name === "@relkit/inspector");
  if (!tool) throw new TypeError("Inspector candidate archive is required");
  return {
    packages,
    manifest: {
      name: "relkit-inspector-image",
      private: true,
      type: "module",
      dependencies: { "@relkit/inspector": `file:./artifacts/${tool.file}` },
      overrides: Object.fromEntries(
        packages.map((item) => [item.name, `file:./artifacts/${item.file}`]),
      ),
    },
  };
}
