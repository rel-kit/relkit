# Deployment

Deploy only when the user asks, and never create, change or delete cloud resources without their explicit approval: each step below that names `railway` acts on their Railway account and can incur cost.

## Targets

| Target   | Engine                                             | Start with                   |
| -------- | -------------------------------------------------- | ---------------------------- |
| Railway  | Container image, deployed with the Railway CLI     | `relkit deploy init railway` |
| AWS      | Pulumi (Labs)                                      | `relkit deploy init aws`     |
| Any host | The image `relkit build` writes to `.relkit/build` | `docker build .relkit/build` |

Vercel and Cloudflare targets are not available yet.

## Before any deploy

Run, from the application root, and fix every failure first:

```sh
bun run check
bun run typecheck
bun run test
bun run build
```

The production image keeps no durable state on its own disk. If the app has jobs, schedules or events on the local filesystem provider, the build warns with `RELKIT_BUILD_LOCAL_DURABLE_PROVIDER` and the image refuses to start (`RELKIT_LOCAL_DURABLE_STATE_IN_CONTAINER`). Switch them to Postgres first; both commands read `DATABASE_URL`:

```sh
bun run relkit add jobs --provider postgres
bun run relkit add events --provider postgres
```

## Deploy to Railway

1. Generate the files. This writes `railway.json`, `Dockerfile`, `.dockerignore` and `.github/workflows/railway-deploy.yml` and changes no cloud resource. Add `--runtime node` for a Node server. A differing existing file stops the command; show the user the difference before rerunning with `--force`.

   ```sh
   bun run relkit deploy init railway
   ```

2. Commit the generated files together with `bun.lock`; the Dockerfile installs with `bun install --frozen-lockfile`.
3. With the user's approval, create the project, the database and the service. `${{Postgres.DATABASE_URL}}` is a Railway reference to the database's private URL; set every other required `defineEnv` value the same way.

   ```sh
   railway init --name <app-name>
   railway add --database postgres
   railway add --service web --variables 'DATABASE_URL=${{Postgres.DATABASE_URL}}'
   ```

4. Deploy, then generate the HTTPS domain:

   ```sh
   railway up --service web
   railway domain --service web
   ```

5. Verify: `curl https://<domain>/healthz` answers `200` with `{"status":"ready","live":true,"ready":true}`. A `503` means a provider is not ready; read `railway logs --service web` for the `Provider startup failed` record and its code.

For deploys on push, the user adds a Railway project token as the GitHub secret `RAILWAY_TOKEN` and the variable `RAILWAY_SERVICE=web`; the generated workflow then checks, tests and deploys every push to `main`.

## Scaling and workers

Several instances share Postgres safely: each schedule occurrence runs once and each job or event delivery runs on one instance at a time. To separate request handling from background work, run a second service from the same source with `RELKIT_WORKER_ROLE=worker` and set `RELKIT_WORKER_ROLE=api` on `web`.

## Health and shutdown

- `/healthz` answers `200` once every provider is ready and `503` before and while draining; Railway gates each deploy on it.
- `/_relkit/v1/health/live` answers while the process runs.
- On `SIGTERM` the server stops admitting requests and drains within `RELKIT_DRAIN_TIMEOUT_MS` (60 seconds by default).

Report the deployed URL, the commands run, and any step that was skipped or not verified.
