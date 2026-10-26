# Only checksum-verified packed candidate archives enter this build.
FROM node:22-bookworm-slim AS node
FROM oven/bun:1.3.10 AS install
WORKDIR /install
ARG INSPECTOR_IMAGE_INPUT=.relkit/inspector-image
COPY ${INSPECTOR_IMAGE_INPUT}/ ./
RUN bun install --production --ignore-scripts --linker=isolated --network-concurrency 1

FROM oven/bun:1.3.10
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/LICENSE /licenses/node-LICENSE
WORKDIR /app
COPY --from=install /install/node_modules ./node_modules
COPY --from=install /install/package.json ./package.json
COPY --from=install /install/candidate.json ./candidate.json
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
USER bun
EXPOSE 3210
HEALTHCHECK --interval=10s --timeout=2s --start-period=10s --retries=3 CMD bun -e 'fetch("http://127.0.0.1:3210/_relkit/backend/health/live").then(r=>process.exit(r.ok?0:1),()=>process.exit(1))'
ENTRYPOINT ["bun", "/app/node_modules/@relkit/inspector/dist/container-bin.js"]
