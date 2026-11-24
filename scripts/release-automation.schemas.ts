/** Decodes GitHub release evidence before commit, attempt, job and artifact authority is checked. */
import { Schema } from "effect";

/** Both CI and Release records carry their immutable execution identity. */
export const ReleaseRun = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  path: Schema.String,
  head_branch: Schema.String,
  head_sha: Schema.String,
  head_repository: Schema.Struct({ full_name: Schema.String }),
  event: Schema.String,
  status: Schema.String,
  conclusion: Schema.NullOr(Schema.String),
  run_attempt: Schema.Number,
});

/** Unfiltered pagination must reach the end before absence authorizes a first pack. */
export const ReleaseRuns = Schema.Struct({
  total_count: Schema.Number,
  workflow_runs: Schema.Array(ReleaseRun),
});

/** Attempt and timestamps bind an immutable artifact to its original upload job. */
export const ReleaseJobs = Schema.Struct({
  total_count: Schema.Number,
  jobs: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      conclusion: Schema.NullOr(Schema.String),
      run_attempt: Schema.Number,
      started_at: Schema.NullOr(Schema.String),
      completed_at: Schema.NullOr(Schema.String),
    }),
  ),
});

/** Deleted, expired or replacement uploads cannot serve as original release archives. */
export const ReleaseArtifacts = Schema.Struct({
  total_count: Schema.Number,
  artifacts: Schema.Array(
    Schema.Struct({
      id: Schema.Number,
      name: Schema.String,
      expired: Schema.Boolean,
      created_at: Schema.String,
      updated_at: Schema.String,
    }),
  ),
});

/** A draft is unfinished; only a public release closes a batch. */
export const ReleaseState = Schema.Struct({
  data: Schema.Struct({
    repository: Schema.Struct({
      release: Schema.NullOr(Schema.Struct({ isDraft: Schema.Boolean })),
    }),
  }),
});

/** Live main is used only for the versioning lease and follow-up dispatch. */
export const MainReference = Schema.Struct({ object: Schema.Struct({ sha: Schema.String }) });

/** Only a merged pull request of this repository can lend its CI to the main commit it produced. */
export const CommitPulls = Schema.Array(
  Schema.Struct({
    merged_at: Schema.NullOr(Schema.String),
    merge_commit_sha: Schema.NullOr(Schema.String),
    base: Schema.Struct({
      ref: Schema.String,
      repo: Schema.Struct({ full_name: Schema.String }),
    }),
    head: Schema.Struct({
      sha: Schema.String,
      repo: Schema.NullOr(Schema.Struct({ full_name: Schema.String })),
    }),
  }),
);

/** The open release pull request, read to avoid versioning the same main commit twice. */
export const OpenPulls = Schema.Array(
  Schema.Struct({ head: Schema.Struct({ ref: Schema.String, sha: Schema.String }) }),
);

/** Ancestry between main and the release branch, as GitHub computes it. */
export const Comparison = Schema.Struct({ ahead_by: Schema.Number, behind_by: Schema.Number });
