/** Describes the isolated project and native server owned by the tutorial acceptance run. */
export interface TutorialProject {
  readonly root: string;
  readonly parent: string;
  readonly app: string;
  readonly env: Readonly<Record<string, string | undefined>>;
}
export interface TutorialChild {
  readonly process: Bun.ReadableSubprocess;
  readonly stdout: Promise<string>;
  readonly stderr: Promise<string>;
}
export interface TutorialServer {
  readonly origin: string;
  readonly child: TutorialChild;
}
