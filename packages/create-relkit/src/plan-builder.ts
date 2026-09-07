import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import {
  ADD_FAILURE_CODES,
  AddScaffoldError,
  type AddRequest,
  type ScaffoldFileOperation,
  type ScaffoldPlan,
  type ScaffoldWarning,
} from "./add-types.js";
import type {
  DiscoveredArtifact,
  DiscoveredProfile,
  ProjectDiscovery,
} from "./project-discovery-types.js";
import { mergeScaffoldManifest } from "./plan-manifest.js";
import type { ScaffoldDependencyName } from "./scaffold-catalog.js";

export class PlanBuilder {
  readonly #files = new Map<string, ScaffoldFileOperation>();
  readonly #dependencies = new Set<ScaffoldDependencyName>();
  readonly #scripts = new Map<string, string>();
  readonly #warnings = new Map<string, ScaffoldWarning>();
  readonly #nextSteps = new Set<string>();
  readonly #plannedArtifacts: DiscoveredArtifact[] = [];
  readonly #plannedProfiles: DiscoveredProfile[] = [];

  constructor(
    readonly request: AddRequest,
    readonly discovery: ProjectDiscovery,
  ) {}
  async read(path: string): Promise<string> {
    const planned = this.#files.get(path);
    return planned?.content ?? readFile(resolve(this.discovery.projectRoot, path), "utf8");
  }

  async create(path: string, content: string, mode?: number): Promise<void> {
    if (
      this.#files.has(path) ||
      (await Bun.file(resolve(this.discovery.projectRoot, path)).exists())
    ) {
      collision(`${path} already exists.`);
    }
    this.#files.set(path, {
      path,
      action: "create",
      content,
      ...(mode === undefined ? {} : { mode }),
    });
  }

  async update(path: string, transform: (source: string) => string): Promise<void> {
    const existing = this.#files.get(path);
    let source: string;
    try {
      source =
        existing?.content ?? (await readFile(resolve(this.discovery.projectRoot, path), "utf8"));
    } catch {
      throw new AddScaffoldError(ADD_FAILURE_CODES.invalidProject, `${path} does not exist.`);
    }
    const content = transform(source);
    if (content === source) return;
    this.#files.set(path, {
      path,
      action: existing?.action ?? "update",
      content,
      ...(existing?.mode === undefined ? {} : { mode: existing.mode }),
    });
  }

  dependency(name: ScaffoldDependencyName): void {
    this.#dependencies.add(name);
  }

  get artifacts(): readonly DiscoveredArtifact[] {
    return [...this.discovery.artifacts, ...this.#plannedArtifacts];
  }

  registerArtifact(
    kind: DiscoveredArtifact["kind"],
    value: {
      readonly domain: string;
      readonly path: string;
      readonly binding: string;
      readonly id: string;
      readonly exportKind?: "default" | "named";
    },
  ): void {
    this.#plannedArtifacts.push({
      kind,
      path: value.path,
      domain: value.domain,
      binding: value.binding,
      id: value.id,
      factory: "scaffold",
      exported: true,
      exportKind: value.exportKind ?? "default",
      options: [],
    });
  }

  get profiles(): readonly DiscoveredProfile[] {
    return [...this.discovery.profiles, ...this.#plannedProfiles];
  }

  registerProfile(profile: DiscoveredProfile): void {
    this.#plannedProfiles.push(profile);
  }

  script(name: string, command: string): void {
    this.#scripts.set(name, command);
  }

  warning(code: string, message: string): void {
    this.#warnings.set(code, Object.freeze({ code, message }));
  }

  nextStep(command: string): void {
    this.#nextSteps.add(command);
  }

  async envExample(name: string, value = ""): Promise<void> {
    await this.appendLine(".env.example", `${name}=${value}`, (source) =>
      new RegExp(`^${escape(name)}=`, "m").test(source),
    );
  }

  async gitignore(pattern: string): Promise<void> {
    await this.appendLine(".gitignore", pattern, (source) =>
      source.split(/\r?\n/).includes(pattern),
    );
  }

  async finish(): Promise<ScaffoldPlan> {
    const dependencies = await this.updateManifest();
    return Object.freeze({
      request: this.request,
      projectRoot: this.discovery.projectRoot,
      operations: Object.freeze(
        [...this.#files.values()].sort((a, b) => a.path.localeCompare(b.path)),
      ),
      dependencies: Object.freeze(dependencies),
      artifacts: Object.freeze(
        this.#plannedArtifacts.map(({ kind, path, id, binding }) => ({
          kind,
          path,
          id: id!,
          binding,
        })),
      ),
      profiles: Object.freeze(
        this.#plannedProfiles.map(({ capability, name }) => ({ capability, name })),
      ),
      warnings: Object.freeze([...this.#warnings.values()]),
      nextSteps: Object.freeze([...this.#nextSteps]),
    });
  }

  relative(absolutePath: string): string {
    return relative(this.discovery.projectRoot, absolutePath).replaceAll("\\", "/");
  }

  private async appendLine(
    path: string,
    line: string,
    present: (source: string) => boolean,
  ): Promise<void> {
    if (
      !(await Bun.file(resolve(this.discovery.projectRoot, path)).exists()) &&
      !this.#files.has(path)
    ) {
      await this.create(path, `${line}\n`);
      return;
    }
    await this.update(path, (source) =>
      present(source) ? source : `${source.replace(/\s*$/, "")}\n${line}\n`,
    );
  }

  private async updateManifest(): Promise<Record<string, string>> {
    if (this.#dependencies.size === 0 && this.#scripts.size === 0) return {};
    const path = "package.json";
    const result = mergeScaffoldManifest(await this.read(path), this.#dependencies, this.#scripts);
    await this.update(path, () => result.content);
    return result.added;
  }
}

function collision(message: string): never {
  throw new AddScaffoldError(ADD_FAILURE_CODES.collision, message);
}

function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
