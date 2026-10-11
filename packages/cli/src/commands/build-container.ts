/**
 * Emits the pinned container image and context allowlist for an accepted backend
 * cohort. These pure renderers contain no runtime acquisition; the build stage
 * writes their results only after bundling succeeds.
 */
const BUN_IMAGE =
  "oven/bun:1.3.10@sha256:b86c67b531d87b4db11470d9b2bd0c519b1976eee6fcd71634e73abfa6230d2e";

/** Renders the container build and startup source for the accepted artifact cohort.
 * @param includeJobs - Whether the accepted cohort includes immutable workers.
 * @returns The existing pinned Bun image and container startup source.
 */
export function dockerfile(includeJobs = false): string {
  const jobs = includeJobs ? "COPY jobs.manifest.json ./\nCOPY jobs/ ./jobs/\n" : "";
  return `FROM ${BUN_IMAGE}
ARG SOURCE_DATE_EPOCH=0
WORKDIR /app
COPY server/index.js ./server/index.js
COPY application.graph.json manifest.json openapi.json ./
${jobs}COPY public/ ./public/
RUN mkdir -p .relkit/state .relkit/observability && chown -R bun:bun .relkit
USER bun
ENV NODE_ENV=production
EXPOSE 3000
STOPSIGNAL SIGTERM
CMD ["bun", "run", "--no-env-file", "server/index.js"]
`;
}

/** Renders the container context allowlist for backend and optional worker artifacts.
 * @param includeJobs - Whether worker artifacts belong to the build context.
 * @returns The existing minimal context allowlist excluding environment/state files.
 */
export function dockerignore(includeJobs = false): string {
  const jobs = includeJobs ? "!jobs.manifest.json\n!jobs/\n!jobs/**\n" : "";
  return `*
!Dockerfile
!.dockerignore
!manifest.json
!application.graph.json
!openapi.json
${jobs}!public/
!public/**
!server/
!server/index.js
.env
.env.*
.relkit/state
.relkit/observability
`;
}
