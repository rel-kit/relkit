import { deepFreeze, type JsonPrimitive } from "@zsys/contracts";
import type { EnvRef } from "@zsys/config";
import {
  isProviderMetadata,
  normalizeProviderOptions,
  providerEnvironment,
  providerProfiles,
  PROVIDER_CAPABILITIES,
} from "./providers-validation.js";

export type ProviderRecipe = "local" | "test" | "aws";
export const PROVIDER_RECIPE: unique symbol = Symbol.for("zsys.provider.recipe");
export type ProviderCapability =
  "buckets" | "cache" | "jobs" | "events" | "models" | "observability";
export type ProviderValue =
  JsonPrimitive | EnvRef | readonly ProviderValue[] | { readonly [key: string]: ProviderValue };
export type ProviderConfig = Readonly<Record<string, ProviderValue>>;
export type ProviderProfiles = Readonly<Record<string, ProviderConfig>>;

export interface LocalProviderOptions {
  readonly stateDirectory?: string;
  readonly observabilityDirectory?: string;
  readonly buckets?: ProviderProfiles;
  readonly cache?: ProviderProfiles;
  readonly jobs?: ProviderProfiles;
  readonly events?: ProviderProfiles;
  readonly models?: ProviderProfiles;
}

export interface TestProviderOptions extends LocalProviderOptions {
  readonly deterministicIds?: boolean;
  readonly deterministicClock?: boolean;
}

export interface AwsProviderOptions {
  readonly region: string | EnvRef<string, string>;
  readonly buckets?: ProviderProfiles;
  readonly cache?: ProviderProfiles;
  readonly jobs?: ProviderProfiles;
  readonly events?: ProviderProfiles;
  readonly models?: ProviderProfiles;
}

export interface ProviderSetMetadata {
  readonly kind: "provider-metadata";
  readonly capabilities: readonly ProviderCapability[];
  readonly configuration: ProviderConfig;
  readonly profiles: Readonly<Record<string, readonly ProviderCapability[]>>;
  readonly environment: readonly {
    readonly name: string;
    readonly type: string;
    readonly sensitive: boolean;
  }[];
}

export interface ProviderSet<Recipe extends ProviderRecipe = ProviderRecipe> {
  readonly kind: "provider-set";
  readonly metadata: ProviderSetMetadata;
  readonly recipe: Recipe;
  readonly recipeTag: Recipe;
  readonly [PROVIDER_RECIPE]: Recipe;
}

export interface ProviderSets {
  readonly development: ProviderSet<"local">;
  readonly test: ProviderSet<"test">;
  readonly production: ProviderSet<"aws">;
}

export function localProviders(options: LocalProviderOptions = {}): ProviderSet<"local"> {
  return createProviderSet("local", options);
}

export function testProviders(options: TestProviderOptions = {}): ProviderSet<"test"> {
  return createProviderSet("test", options);
}

export function awsProviders(options: AwsProviderOptions): ProviderSet<"aws"> {
  return createProviderSet("aws", options);
}

export function isProviderSet(value: unknown): value is ProviderSet {
  const recipe = providerRecipe(value);
  const metadata = isRecord(value) ? Object.getOwnPropertyDescriptor(value, "metadata") : undefined;
  return (
    recipe !== undefined &&
    isRecord(value) &&
    Reflect.ownKeys(value).length === 5 &&
    Object.getOwnPropertyDescriptor(value, "kind")?.value === "provider-set" &&
    metadata !== undefined &&
    "value" in metadata &&
    isProviderMetadata(metadata.value)
  );
}

/** Returns the hidden internal recipe tag without exposing runtime factories. */
export function providerRecipe(value: unknown): ProviderRecipe | undefined {
  if (!isRecord(value)) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, PROVIDER_RECIPE);
  const recipe = descriptor && "value" in descriptor ? descriptor.value : undefined;
  if (!isRecipe(recipe)) return undefined;
  return hiddenTag(value, PROVIDER_RECIPE, recipe) &&
    hiddenTag(value, "recipe", recipe) &&
    hiddenTag(value, "recipeTag", recipe)
    ? recipe
    : undefined;
}

export function copyProviderSets(value: unknown): ProviderSets {
  if (!isRecord(value)) throw new TypeError("App providers must be an object");
  const expected = {
    development: "local",
    test: "test",
    production: "aws",
  } as const;
  const names = Object.keys(expected) as (keyof typeof expected)[];
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== names.length ||
    keys.some((name) => typeof name !== "string" || !names.includes(name as keyof typeof expected))
  ) {
    throw new TypeError("App providers must contain only development, test, and production sets");
  }
  const providers = {} as Record<keyof typeof expected, ProviderSet>;
  for (const name of names) {
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    const provider = descriptor && "value" in descriptor ? descriptor.value : undefined;
    if (!isProviderSet(provider) || providerRecipe(provider) !== expected[name]) {
      throw new TypeError(`${name} providers must use the ${expected[name]} recipe`);
    }
    providers[name] = provider;
  }
  return Object.freeze(providers) as ProviderSets;
}

function createProviderSet<Recipe extends ProviderRecipe>(
  recipe: Recipe,
  options: object,
): ProviderSet<Recipe> {
  if (!isRecord(options)) throw new TypeError("Provider options must be an object");
  const configuration = normalizeProviderOptions(recipe, options);
  const metadata = deepFreeze({
    kind: "provider-metadata" as const,
    capabilities: PROVIDER_CAPABILITIES,
    configuration,
    profiles: providerProfiles(options),
    environment: providerEnvironment(configuration),
  }) as ProviderSetMetadata;
  const result = { kind: "provider-set" as const, metadata } as Record<PropertyKey, unknown>;
  Object.defineProperty(result, "recipe", { value: recipe });
  Object.defineProperty(result, "recipeTag", { value: recipe });
  Object.defineProperty(result, PROVIDER_RECIPE, { value: recipe });
  return Object.freeze(result) as unknown as ProviderSet<Recipe>;
}

function hiddenTag(
  value: Record<PropertyKey, any>,
  key: PropertyKey,
  expected: ProviderRecipe,
): boolean {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return (
    descriptor?.value === expected &&
    descriptor.enumerable === false &&
    descriptor.writable === false &&
    descriptor.configurable === false
  );
}

function isRecipe(value: unknown): value is ProviderRecipe {
  return value === "local" || value === "test" || value === "aws";
}

function isRecord(value: unknown): value is Record<PropertyKey, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
