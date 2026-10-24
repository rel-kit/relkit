/** Finite approved workspace owners and forbidden source-scope patterns; no files are read here. */
export const approvedPackages = new Set(
  "agents app better-auth buckets cache cli client client-generator cloud-aws compiler config contracts create-relkit deploy deploy-pulumi diagnostics drizzle engine events functions graph inspector inspector-api invocation jobs local-service observability observability-local openapi provider providers-local providers-standard realtime relkit routes runtime-effect runtime-hono schema services supervisor testing tools".split(
    " ",
  ),
);
export const approvedApps = new Set(["docs", "inspector"]);
export const approvedExamples = new Set(
  "README.md auth-drizzle commerce commerce-web data-model".split(" "),
);
export const approvedTemplates = new Set(["default"]);
export const integrationPath = /^integrations\/(?:catalog(?:\/|$)|packages\/[^/]+(?:\/|$))/;
export const forbiddenNames =
  "persistence|identity|workflow|knowledge(?:-store)?|plugin|marketplace|subscription|entity|relation";
export const proseAllowlist = [
  /^AGENTS\.md$/,
  /^docs\/(?:README\.md|briefs\/|records\/|relkit-typescript-poc-(?:technical-spec|review-gates)-v3\.md)/,
  /^openspec\/changes\/implement-relkit-typescript-poc-v3\//,
  /^tests\/jobs\/compatibility\/evidence\//,
];
export const implementationFiles = new Set([
  "apps/docs/tsconfig.json",
  "scripts/scope-scan.ts",
  "scripts/scope-policy.ts",
  "scripts/scope-typescript-settings.ts",
  "scripts/scope-typescript-settings.test.ts",
]);
export const contentExtensions = /\.(?:(?:c|m)?(?:ts|tsx|js|jsx)|json|toml|ya?ml|md)$/i;
// Test runners emit these workspace-root directories; authored src/coverage stays in scope.
export const generatedCoverage =
  /^(?:(?:apps|examples|packages|templates)\/[^/]+|integrations\/(?:catalog|packages\/[^/]+))\/coverage\//;
export const alternateIac =
  /\b(?:terraform|opentofu|cloudformation|(?:aws-)?cdk|sst|alchemy|serverless|bicep)\b|@cdktf|aws-cdk-lib|arm[-_ ]?template/i;
export const isAllowlistedProse = (path: string): boolean =>
  proseAllowlist.some((pattern) => pattern.test(path));

export const contentPatterns: ReadonlyArray<readonly [string, RegExp, string]> = [
  [
    "subscription-primitive",
    /\bdefineSubscription\b/g,
    "defineSubscription is not part of the public API",
  ],
  [
    "out-of-scope-api",
    /\b(?:define|create)(?:Persistence|Identity|Workflow|KnowledgeStore|Plugin|Marketplace)\b/g,
    "out-of-scope public API name",
  ],
  [
    "out-of-scope-package",
    new RegExp(`@relkit/(?:${forbiddenNames})(?=[/"'\`]|$)`, "gi"),
    "out-of-scope package name",
  ],
  [
    "out-of-scope-graph-name",
    new RegExp(
      `\\b(?:kind|nodeKind|graphKind|nodeType|resourceType)\\s*[:=]\\s*[\\"'\\x60](?:${forbiddenNames})[\\"'\\x60]`,
      "gi",
    ),
    "out-of-scope graph node name",
  ],
  [
    "out-of-scope-navigation-name",
    new RegExp(`[\\"'\\x60]\\/?(?:${forbiddenNames})s?(?:[/?#][^\\"'\\x60]*)?[\\"'\\x60]`, "gi"),
    "out-of-scope navigation or route name",
  ],
  [
    "out-of-scope-template-name",
    new RegExp(
      `\\b(?:template|templates|preset|variant)\\s*[:=]\\s*[\\"'\\x60](?:${forbiddenNames})[\\"'\\x60]`,
      "gi",
    ),
    "out-of-scope template name",
  ],
];
