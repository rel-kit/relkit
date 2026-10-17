/** GitHub run fields independently checked before a dispatched release receives publication authority. */
export interface ReleaseCiRun {
  readonly id: number;
  readonly name: string;
  readonly path: string;
  readonly head_branch: string;
  readonly head_sha: string;
  readonly head_repository: { readonly full_name: string };
  readonly event: string;
  readonly status: string;
  readonly conclusion: string | null;
}
