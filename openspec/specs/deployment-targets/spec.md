# deployment-targets Specification

## Purpose
Defines how RelKit applications are built for production and deployed to supported hosts, starting
with a portable container image and Railway.

## Requirements

### Requirement: Production container image

`relkit build` SHALL produce a documented, production-ready container image definition that runs as a
non-root user, keeps no durable application state on the container's disk and exposes the health
endpoints.

#### Scenario: Container is replaced

- **WHEN** the container is replaced during a redeploy
- **THEN** no jobs, events or schedules are lost, because durable state lives in the configured
  backend

### Requirement: Deploy target initialization

`relkit deploy init <target>` SHALL generate the configuration files and a CI workflow for the
selected target without changing any cloud resource.

#### Scenario: Railway initialization

- **WHEN** a developer runs `relkit deploy init railway`
- **THEN** `railway.json`, the container build files and a CI workflow are created and no cloud
  resource changes

### Requirement: Railway target

The Railway target SHALL deploy the container image with Railway Postgres as the durable backend, and
a newcomer SHALL be able to deploy the `api` template by following the guide in 15 minutes or less.

#### Scenario: Newcomer deploy

- **WHEN** a newcomer follows the Railway guide after running `create-relkit`
- **THEN** the app is reachable over HTTPS, and jobs, events and schedules work across a restart and
  with two instances

### Requirement: Vercel target

The Vercel target SHALL deploy the Node production server as functions, run schedules through Vercel
Cron, use an external durable backend for jobs and events, and require an external provider for
WebSocket realtime.

#### Scenario: Scheduled job on Vercel

- **WHEN** a schedule is due on a Vercel deployment
- **THEN** Vercel Cron triggers it once and the run is recorded in the durable backend

### Requirement: Cloudflare target

The Cloudflare target SHALL deploy the Workers bundle, run jobs and events through Cloudflare Queues,
schedules through Cron Triggers and realtime through Durable Objects.

#### Scenario: Event on Cloudflare

- **WHEN** a function publishes an event on a Cloudflare deployment
- **THEN** each consumer receives it through Cloudflare Queues with at-least-once delivery

### Requirement: Engine selection per target

Deployment SHALL use Pulumi for targets with a maintained Pulumi provider and the platform's own
configuration and CLI otherwise, and the docs SHALL state which engine each target uses.

#### Scenario: Target without a maintained Pulumi provider

- **WHEN** a target has no maintained Pulumi provider
- **THEN** `relkit deploy init` generates the platform's native configuration instead of a Pulumi
  program

### Requirement: Target order and maturity

Railway SHALL ship first, Vercel after Node support, and Cloudflare after the Workers adapter. A
target SHALL be Labs until its newcomer deploy test passes in CI.

#### Scenario: Target before its test passes

- **WHEN** a target's newcomer deploy test is not yet passing
- **THEN** its docs page carries the Labs badge
