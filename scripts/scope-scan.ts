/** Scans authored paths and text using the finite repository scope policy, retaining exact violation positions. */
import { existsSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { isTypeScriptPluginSetting } from "./scope-typescript-settings.js";
import type { ScopeViolation } from "./scope-scan.types.js";
export type { ScopeViolation } from "./scope-scan.types.js";
import {
  approvedPackages,
  approvedApps,
  approvedExamples,
  approvedTemplates,
  integrationPath,
  forbiddenNames,
  implementationFiles,
  contentExtensions,
  generatedCoverage,
  alternateIac,
  isAllowlistedProse,
  contentPatterns,
} from "./scope-policy.js";
function position(text: string, offset: number): { line: number; column: number } {
  const before = text.slice(0, offset);
  const line = before.split("\n").length;
  const column = offset - before.lastIndexOf("\n");
  return { line, column };
}
function violation(
  root: string,
  file: string,
  rule: string,
  message: string,
  text?: string,
  offset = 0,
): ScopeViolation {
  const path = relative(root, file).replaceAll("\\", "/");
  const location = text === undefined ? { line: 1, column: 1 } : position(text, offset);
  return { file: path, ...location, rule, message };
}
function pathViolations(root: string, file: string): ScopeViolation[] {
  const path = relative(root, file).replaceAll("\\", "/");
  const parts = path.split("/");
  const findings: ScopeViolation[] = [];
  const add = (rule: string, message: string): void => {
    findings.push(violation(root, file, rule, message));
  };
  if (parts[0] === "packages" && parts[1] && !approvedPackages.has(parts[1])) {
    add("out-of-scope-package", `packages/${parts[1]} is not an approved RelKit package`);
  }
  if (parts[0] === "apps" && parts[1] && !approvedApps.has(parts[1])) {
    add("out-of-scope-package", `apps/${parts[1]} is not an approved RelKit app`);
  }
  if (parts[0] === "examples" && parts[1] && !approvedExamples.has(parts[1])) {
    add("out-of-scope-package", `examples/${parts[1]} is not an approved RELKIT example`);
  }
  if (parts[0] === "templates" && parts[1] && !approvedTemplates.has(parts[1])) {
    add("out-of-scope-template-name", `templates/${parts[1]} is not the approved template root`);
  }
  if (/(?:^|\/)[^/]+\.subscription\.ts$/i.test(path)) {
    add("subscription-source", `separate subscription source file is forbidden: ${path}`);
  }
  if (/(?:^|\/)(?:Cargo\.(?:toml|lock)|rust-toolchain(?:\.toml)?|[^/]+\.rs)$/i.test(path)) {
    add("rust-source", `Rust source or project metadata is forbidden: ${path}`);
  }
  if (
    !integrationPath.test(path) &&
    (/(?:^|\/)(?:terraform|opentofu|cloudformation|cdk|sst|alchemy|serverless|bicep)(?:\/|\.|$)/i.test(
      path,
    ) ||
      /\.(?:tf|tf\.json)$/i.test(path))
  ) {
    add("alternate-iac", `alternate infrastructure-engine path or file is forbidden: ${path}`);
  }
  findings.push(...navigationViolations(root, file, parts));
  return findings;
}
/** Checks each authored navigation segment independently of package and infrastructure paths. */
function navigationViolations(
  root: string,
  file: string,
  parts: readonly string[],
): ScopeViolation[] {
  const findings: ScopeViolation[] = [];
  if (["apps", "examples", "templates", "tests"].includes(parts[0] ?? "")) {
    for (const part of parts.slice(1)) {
      const name = part
        .replace(/\.[^.]+$/, "")
        .replace(/[^a-z0-9-]/gi, "")
        .toLowerCase();
      if (new RegExp(`^(?:${forbiddenNames})s?$`, "i").test(name)) {
        findings.push(
          violation(
            root,
            file,
            parts[0] === "templates"
              ? "out-of-scope-template-name"
              : "out-of-scope-navigation-name",
            `out-of-scope name in ${parts[0]} path: ${part}`,
          ),
        );
      }
    }
  }
  return findings;
}
function contentViolations(root: string, file: string): ScopeViolation[] {
  const path = relative(root, file).replaceAll("\\", "/");
  if (isAllowlistedProse(path) || implementationFiles.has(path) || !contentExtensions.test(path)) {
    return [];
  }
  const text = readFileSync(file, "utf8");
  const findings: ScopeViolation[] = [];
  for (const [rule, pattern, message] of contentPatterns) {
    for (const match of text.matchAll(pattern)) {
      if (rule === "out-of-scope-navigation-name" && /^["'`][A-Z][A-Z0-9_]*["'`]$/.test(match[0]))
        continue;
      const offset = match.index ?? 0;
      if (rule === "out-of-scope-navigation-name" && isTypeScriptPluginSetting(path, text, offset))
        continue;
      findings.push(violation(root, file, rule, message, text, offset));
    }
  }
  if (!integrationPath.test(path) && alternateIac.test(text)) {
    findings.push(
      violation(
        root,
        file,
        "alternate-iac",
        "alternate infrastructure engine name",
        text,
        text.search(alternateIac),
      ),
    );
  }
  return findings;
}
function filesToScan(root: string): string[] {
  const paths = "package.json bunfig.toml turbo.json tsconfig.json tsconfig.base.json".split(" ");
  for (const directory of "apps examples integrations packages templates scripts tests .github".split(
    " ",
  )) {
    const absolute = resolve(root, directory);
    if (!existsSync(absolute)) continue;
    paths.push(
      ...[...new Bun.Glob("**/*").scanSync({ cwd: absolute, onlyFiles: true })]
        .filter((path) => !/(^|\/)(dist|node_modules|\.turbo|\.relkit)(\/|$)/.test(path))
        .map((path) => `${directory}/${path}`)
        .filter((path) => !generatedCoverage.test(path)),
    );
  }
  return [...new Set(paths.map((path) => resolve(root, path)))].sort();
}
export function scanScope(root: string): ScopeViolation[] {
  const violations: ScopeViolation[] = [];
  for (const file of filesToScan(root)) {
    if (!existsSync(file)) continue;
    violations.push(...pathViolations(root, file), ...contentViolations(root, file));
  }
  return violations.sort((left, right) =>
    `${left.file}:${left.line}:${left.column}:${left.rule}`.localeCompare(
      `${right.file}:${right.line}:${right.column}:${right.rule}`,
    ),
  );
}
