import { ADD_FAILURE_CODES, AddScaffoldError } from "./add-types.js";

export interface NormalizedArtifactName {
  readonly input: string;
  readonly fileStem: string;
  readonly identifier: string;
  readonly idSegment: string;
}

/** Normalizes one friendly label for source files, bindings, and stable IDs. */
export function normalizeArtifactName(input: string): NormalizedArtifactName {
  const value = input.normalize("NFKC").trim();
  const fileStem = value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-")
    .toLowerCase();
  if (!/^[a-z][a-z0-9-]*$/.test(fileStem)) {
    throw new AddScaffoldError(
      ADD_FAILURE_CODES.usage,
      `Name must normalize to a value beginning with a letter: ${input}`,
    );
  }
  const identifier = fileStem.replace(/-([a-z0-9])/g, (_, letter: string) => letter.toUpperCase());
  return Object.freeze({ input: value, fileStem, identifier, idSegment: fileStem });
}
