# @relkit/inspector

The standalone RELKIT development inspector owns its UI, collector and local
diagnostic history. The backend and `@relkit/cli` run independently of this package.
It requires Bun 1.3.10 or newer and Node.js 20.9.0 or newer.

## Enable the application bridge

Select inspection explicitly in the application's `relkit.config.ts`:

```ts
import { defineApp, defineEnv } from "@relkit/app/config";

export default defineApp({ env: defineEnv({}), inspector: { enabled: true } });
```

Omitted or disabled inspection acquires no bridge, discovery files, UI process or
history worker. Enabled inspection defaults to an ephemeral port on
`127.0.0.1`. Set `inspector.connection.host` and `inspector.connection.port` only
when an explicit bind address is needed. The retired `inspector.port` setting and
`relkit dev --inspector-port` flag are rejected with correction guidance.
Production builds exclude rich inspection even when development config enables it.

## Run the separate tool

Install this package as an explicit development dependency from a release that
contains it. This implementation's local candidate verification does not publish
the package to a registry.

Keep independent project scripts:

```json
{
  "scripts": {
    "dev": "relkit dev",
    "inspector": "relkit-inspector --project-root ."
  }
}
```

Run `bun run dev` in one terminal and `bun run inspector` in another. The UI
defaults to `http://127.0.0.1:3210`. Its `--port` changes the UI address, separately
from the application bridge. Starting or stopping either process does not start
or stop the other.

Installed executable help is available through either tested runner:

```sh
bunx --no-install relkit-inspector --help
npx --no-install relkit-inspector --help
```

The tool discovers private session descriptors in the project's
`.relkit/connections/` directory without evaluating application configuration.
With no live session it stays disconnected and retries; with several compatible
sessions it requires `--connection-file <file>`. Authentication verifies the live
project/session identity, rather than trusting PID or file age. A dev reload keeps
the session and bridge address; a full restart rotates the credentials.

## History and recovery

History defaults to `<project>/.relkit/observability/observability.duckdb`.
`--history-directory <directory>` selects an explicit persistent directory. The
directory is bound to one project identity. A foreign project volume is rejected.
Retained history remains readable after app reloads, tool restarts and removal of
the package-runner cache. The tool never stores history inside its installation.

Only one tool may write a history directory. On `history.writer-conflict`, stop
the other inspector before restarting this one. Do not delete the database to
clear a lock. Permission, corruption, disk-full and worker failures degrade
inspection; automatic history opening retries stop after three failures. Fix the
underlying issue and restart the tool. Diagnostic capture is independent of
durable jobs, checkpoints, provider caches and business data.

The bridge retains redacted records in a bounded memory buffer before the tool
connects. Overflow and producer delivery failures are reported as incomplete
capture. The collector advances a durable ACK only after history commits; replay
deduplicates the same session/sequence identity while preserving later revisions.
Capture before connection and shutdown flushing do not guarantee complete history.

The default early buffer is 2,048 records/2 MiB, with configurable ceilings of
65,536 records/64 MiB. Wire records and persistence batches have a 1 MiB ceiling;
batches contain at most 256 records and collection polls every 100 ms. Collection
has one pending batch. Live subscribers default to 64 queued events, with ceilings
of 256 events/1 MiB each and 4 MiB aggregate backlog. Slow subscribers disconnect.
Support shutdown has a five-second deadline and reports incomplete flushing.

## Connection security

Descriptor directories are owner-only (`0700`); descriptor files are owner-only
(`0600`), atomically published and removed only by their owning session. Keep them
out of source control. Do not put their tokens in browser URLs or frontend code.
Every bridge operation checks credentials, project/session, Host and Origin;
mutations also fence the observed generation. Application cookies, authorization
and operation IDs retain their native meaning. Lost mutation responses are not
retried automatically.

`--connection-file`, `--credential-file`, `--target` and history paths are trusted
launch options. Browser requests cannot replace them. A target override changes
network routing while retaining the descriptor Host and authenticated identity.
See the [container guide](DOCKER.md) for restricted mounts, networking, rotation,
persistent history and health checks.
