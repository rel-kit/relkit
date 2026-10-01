/** Runtime integration export binding selected for static module generation. */
export interface RuntimeModuleImport {
  readonly packageName: string;
  readonly packageVersion: string;
  readonly exportName: string;
}
