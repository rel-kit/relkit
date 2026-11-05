/**
 * Emits the pinned container image and context allowlist for an accepted backend
 * cohort. These pure renderers contain no runtime acquisition; the build stage
 * writes their results only after bundling succeeds.
 */
import type { RuntimeName } from "relkit/runtime";

const BUN_IMAGE =
  "oven/bun:1.3.10@sha256:b86c67b531d87b4db11470d9b2bd0c519b1976eee6fcd71634e73abfa6230d2e";
const NODE_IMAGE =
  "node:24.22.0-bookworm-slim@sha256:91acba91b842bec0bf7ea6f5e09c644c7ccad72c4996ed9616d861d1c7cd60d4";

/** Renders the container build and startup source for the accepted artifact cohort.
 * @param includeJobs - Whether the accepted cohort includes immutable workers.
 * @param includeRepairs - Whether the emitted build contains selected native patch assets.
 * @param runtime - Runtime the server runs on; Node images still install with Bun, which applies the selected patches.
 * @returns The pinned image and container startup source.
 */
export function dockerfile(
  includeJobs = false,
  includeRepairs = false,
  runtime: RuntimeName = "bun",
): string {
  const jobs = includeJobs ? "COPY jobs.manifest.json ./\nCOPY jobs/ ./jobs/\n" : "";
  const install = `COPY package.json ./
${includeRepairs ? "COPY patches/ ./patches/\n" : ""}RUN bun install --production --network-concurrency 1
`;
  const artifacts = `COPY server/ ./server/
COPY application.graph.json manifest.json openapi.json ./
${jobs}COPY public/ ./public/
`;
  if (runtime === "node")
    return `FROM ${BUN_IMAGE} AS dependencies
ARG SOURCE_DATE_EPOCH=0
WORKDIR /app
${install}RUN mkdir -p node_modules

FROM ${NODE_IMAGE}
ARG SOURCE_DATE_EPOCH=0
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json ./
${artifacts}RUN mkdir -p .relkit/state .relkit/observability && chown -R node:node .relkit
USER node
ENV NODE_ENV=production
EXPOSE 3000
STOPSIGNAL SIGTERM
CMD ["node", "server/index.js"]
`;
  return `FROM ${BUN_IMAGE}
ARG SOURCE_DATE_EPOCH=0
WORKDIR /app
${install}${artifacts}RUN mkdir -p .relkit/state .relkit/observability && chown -R bun:bun .relkit
USER bun
ENV NODE_ENV=production
EXPOSE 3000
STOPSIGNAL SIGTERM
CMD ["bun", "run", "--no-env-file", "server/index.js"]
`;
}

/** Renders the container context allowlist for backend and optional worker artifacts.
 * @param includeJobs - Whether worker artifacts belong to the build context.
 * @param includeRepairs - Whether the emitted build contains selected native patch assets.
 * @returns The existing minimal context allowlist excluding environment/state files.
 */
export function dockerignore(includeJobs = false, includeRepairs = false): string {
  const jobs = includeJobs ? "!jobs.manifest.json\n!jobs/\n!jobs/**\n" : "";
  return `*
!Dockerfile
!.dockerignore
!manifest.json
!application.graph.json
!openapi.json
!package.json
${includeRepairs ? "!patches/\n!patches/**\n" : ""}${jobs}!public/
!public/**
!server/
!server/**
server/node_modules
server/node_modules/**
.env
.env.*
.relkit/state
.relkit/observability
`;
}
