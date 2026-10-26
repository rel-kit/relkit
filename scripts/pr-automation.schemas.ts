/** Validates GitHub authority fields before a completed CI run can propose a commit to an open same-repository PR. */
import { Schema } from "effect";

const repository = Schema.Struct({ full_name: Schema.String });
const branch = Schema.Struct({ sha: Schema.String, ref: Schema.String, repo: repository });

/** Only completed PR CI from the owning workflow may trigger preparation. */
export const PreparationRun = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  path: Schema.String,
  event: Schema.String,
  status: Schema.String,
  conclusion: Schema.NullOr(Schema.String),
  head_sha: Schema.String,
  head_repository: repository,
  run_attempt: Schema.Number,
});

/** Current server-side branch state is authoritative, rather than artifact-supplied PR identity. */
export const PreparationPull = Schema.Struct({
  number: Schema.Number,
  title: Schema.String,
  state: Schema.String,
  base: branch,
  head: branch,
  user: Schema.Struct({ login: Schema.String }),
});

/** Bounded Actions listings must be complete before selecting a producer or artifact. */
export const PreparationJobs = Schema.Struct({
  total_count: Schema.Number,
  jobs: Schema.Array(
    Schema.Struct({ name: Schema.String, conclusion: Schema.NullOr(Schema.String) }),
  ),
});

/** Artifact names include the exact PR head and run attempt to prevent cross-run reuse. */
export const PreparationArtifacts = Schema.Struct({
  total_count: Schema.Number,
  artifacts: Schema.Array(
    Schema.Struct({
      id: Schema.Number,
      name: Schema.String,
      expired: Schema.Boolean,
      size_in_bytes: Schema.Number,
    }),
  ),
});
