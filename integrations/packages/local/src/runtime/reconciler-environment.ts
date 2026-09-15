import {
  normalizeLocalServiceRecipe,
  type LocalServiceRecipeInput,
} from "@relkit/local-service";

export function environmentFile(
  recipe: LocalServiceRecipeInput,
  secrets: Readonly<Record<string, string>>,
): string | undefined {
  const entries = Object.entries(normalizeLocalServiceRecipe(recipe).environment).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  if (entries.length === 0) return undefined;
  return `${entries
    .map(([name, reference]) => {
      const literal = "value" in reference ? reference.value : undefined;
      const secret = "secret" in reference ? secrets[reference.secret] : undefined;
      const resolved = literal ?? secret;
      validateEnvironment(name, resolved);
      return `${name}=${resolved}`;
    })
    .join("\n")}\n`;
}

export function environmentFiles(
  recipe: LocalServiceRecipeInput,
  secrets: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  const normalized = normalizeLocalServiceRecipe(recipe);
  if (normalized.recipeVersion === 1) return Object.freeze({});
  const root = resolveEnvironment(normalized.environment, secrets);
  const files: Record<string, string> = {};
  for (const unit of normalized.units) {
    const file = formatEnvironment({ ...root, ...resolveEnvironment(unit.environment, secrets) });
    if (file !== undefined) files[unit.id] = file;
  }
  return Object.freeze(files);
}

function resolveEnvironment(
  values: Readonly<Record<string, { readonly value?: string; readonly secret?: string }>> | undefined,
  secrets: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  const resolved: Record<string, string> = {};
  for (const [name, reference] of Object.entries(values ?? {})) {
    const value = reference.value ?? (reference.secret === undefined ? undefined : secrets[reference.secret]);
    validateEnvironment(name, value);
    resolved[name] = value;
  }
  return resolved;
}

function formatEnvironment(values: Readonly<Record<string, string>>): string | undefined {
  const entries = Object.entries(values).sort(([left], [right]) => left.localeCompare(right));
  return entries.length === 0 ? undefined : `${entries.map(([name, value]) => `${name}=${value}`).join("\n")}\n`;
}

function validateEnvironment(name: string, value: string | undefined): asserts value is string {
  if (!/^[A-Z][A-Z0-9_]*$/.test(name) || typeof value !== "string" || /[\0\r\n]/.test(value)) {
    throw new Error("Local service environment is invalid.");
  }
}
