# Run the standalone Inspector in Docker

The image contains the packed tool, Bun 1.3.10, Node 22, the production Next UI
and native DuckDB dependencies. It runs as a non-root user. Application source,
dependencies, environment files and Docker sockets are not tool mounts.

## Build an exact local candidate

From the RELKIT repository root, build the private UI/tool and produce candidate
archives with the existing release packer. Then stage the archive directory that
contains its `manifest.json`:

```sh
bun run scripts/prepare-inspector-image.ts /absolute/candidate/artifacts
bun run scripts/build-inspector-image.ts relkit-inspector:0.1.0-local
```

Staging verifies archive identities/checksums and refuses an existing output
directory. The Dockerfile-specific ignore file admits only image inputs under
`.relkit/inspector-image*`; the final image copies only installed runtime packages,
the install manifest and candidate provenance. Node's license is under `/licenses`;
package licenses remain with installed packages. The builder owns one CPU and
768 MiB, and is removed after the build. Choose a fresh image tag when rebuilding.
No image or package is published by these commands.

`bun run test:container` builds current packages, packs checksum-verified archives,
builds a fresh constrained image, runs the real container suite and removes its
owned image, builder and input directory. CI requires this gate before release;
running it locally requires Docker and Node. Failed candidate archives are retained
at the printed evidence path.

For another retained candidate, pass a new owned staging directory:

```sh
bun run scripts/prepare-inspector-image.ts /absolute/candidate/artifacts .relkit/inspector-image-next
bun run scripts/build-inspector-image.ts relkit-inspector:next-local .relkit/inspector-image-next
```

## Connect to an app on Docker Desktop's host

Enable the application bridge explicitly. A fixed bridge port keeps a routing
override valid after app restart; the UI has its own port:

```ts
import { defineApp, defineEnv } from "@relkit/app/config";

export default defineApp({
  env: defineEnv({}),
  inspector: {
    enabled: true,
    connection: { host: "0.0.0.0", port: 43210 },
  },
});
```

Merge inspection into the existing configuration, retaining its environment and
providers. Run the app with `bun run dev`. Keep this development listener on
your private development network. Identify its private session descriptor under
`.relkit/connections`, then run from the application root:

```sh
mkdir -p .relkit/observability
docker run --rm --init --name relkit-inspector \
  --user "$(id -u):$(id -g)" \
  --cpus 1 --memory 512m --memory-swap 512m --pids-limit 128 \
  --read-only --cap-drop ALL --security-opt no-new-privileges \
  --tmpfs /tmp:rw,noexec,nosuid,size=128m \
  --publish 127.0.0.1:3210:3210 \
  --mount "type=bind,source=$PWD/.relkit/connections,target=/connections,readonly" \
  --mount "type=bind,source=$PWD/.relkit/observability,target=/history" \
  relkit-inspector:0.1.0-local \
  --connection-file /connections/SESSION-ID.json \
  --history-directory /history --hostname 0.0.0.0 \
  --target http://host.docker.internal:43210
```

Replace `SESSION-ID.json` with the selected descriptor's filename. Its contents
stay private: directory mode `0700`, file mode `0600`. Matching the host UID/GID
lets the non-root process read those files and write the existing history without
changing their ownership. The image rejects root execution, file-only credential
mounts, writable credential mounts and missing/ephemeral history mounts.

Open `http://127.0.0.1:3210`. Only the UI is published, on host loopback. The image
uses internal UI port `3210` for its health probe and rejects another `--port`;
change the host side of `--publish` to select a different local UI port. A target
override changes routing while preserving the descriptor Host, project/session
identity and authenticated handshake. It does not bypass app authorization.
Use `--credential-file` only for a matching private descriptor; mount that entire
credential directory read-only as well.

## Linux host-gateway routing

Use the same mounts, UID and UI publishing. Add this network mapping and replace
the target in the command above:

```sh
--add-host relkit-host:host-gateway
--target http://relkit-host:43210
```

The app bridge must bind a container-reachable host address explicitly. The
host-gateway command is tested against Docker Desktop's Linux daemon; this does
not certify a separate bare-metal Linux host environment.

## Connect over a private Docker network

Join the application container and Inspector to one user-defined bridge network.
Bind the application bridge to `0.0.0.0:43210` inside its container and make its
private connection directory available separately. The application writes that
directory; the Inspector mounts it read-only. Do not publish the app bridge.

Add the Inspector's network choice and target to the same restricted command:

```sh
--network relkit-inspection
--target http://my-app:43210
```

Here `my-app` is the application container's name on `relkit-inspection`. The
Inspector's UI remains published on `127.0.0.1:3210`. Use a user-defined bridge
network for this host UI pattern; internal-only networks can prevent Docker
Desktop from publishing the UI to the host.

## Rotation, history and health

Mount the **directory**, not an individual connection file. Atomic replacement
creates a new inode, which a file-only mount can hide. A full app restart creates
a new session filename and credentials: select the new file when recreating the
Inspector container. An operator-managed private stable selection file may be
replaced atomically in the mounted directory; the authenticated identity is
checked again. Keep the configured target port stable, or update `--target`.

With several live sessions, choose the connection file explicitly. Never select
the newest file or trust PID existence as authentication. Stale credentials give
disconnected status; they are not reused for another session.

The history directory is an explicit persistent bind mount or volume, separate
from package caches and container writable layers. Recreate the container with
that same history directory to retain data. Only one Inspector may write it.
An existing project marker rejects foreign-project history. Never delete the
database to clear a lock. Diagnostic history does not contain the app's durable
jobs/checkpoints or business data.

The UI proxy exposes two health states without exposing credentials:

```sh
curl http://127.0.0.1:3210/_relkit/backend/health/live
curl http://127.0.0.1:3210/_relkit/backend/health/ready
```

Liveness reports the running tool; connected readiness requires a compatible app
and available history. Disconnected or degraded readiness returns `503`, while
retained same-project history can remain readable. The image health check uses
liveness. To stop, use `docker stop --time 5 relkit-inspector`; the tool joins its
UI and storage children within the support shutdown deadline. Incomplete flushes
are disclosed and existing history is preserved.
