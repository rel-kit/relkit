# Spec Delta

## MODIFIED Requirements

### Requirement: Landing page presents local-to-cloud integrations

The landing page SHALL reuse its component and visual system while leading with the agreed
positioning sentence, an executable example, the Inspector and `relkit mcp`, and the path from local
development to a Railway deploy, with links to the Why RelKit page and the guides.

#### Scenario: New developer evaluates RelKit

- **WHEN** the landing page is rendered on desktop or narrow viewport
- **THEN** the developer sees the positioning sentence, the local-to-Railway path and links to Why
  RelKit and the guides, without encountering removed APIs

### Requirement: Experimental development boundaries are explicit

Root contributor guidance SHALL state which features are Core and which are Labs, link the stability
policy, and state that the one pre-1.0 breaking release ships with a migration and a migration guide.
Repository samples SHALL be migrated with the same `relkit migrate` that users run, preserving sample
data and applied migration history.

#### Scenario: Sample migration paths change

- **WHEN** the breaking release updates a repository sample
- **THEN** `relkit migrate` updates the sample and its guidance without resetting its database or
  changing applied migration identifiers

#### Scenario: Contributor looks up maturity

- **WHEN** a contributor reads the root guidance
- **THEN** it links the maturity table and the stability policy

## ADDED Requirements

### Requirement: Consistent positioning

The README, landing page, the npm descriptions of `relkit` and `create-relkit`, and the GitHub
repository description SHALL use the same positioning sentence.

#### Scenario: Description check

- **WHEN** the release check runs
- **THEN** it fails if any of those surfaces differs from the positioning sentence

### Requirement: Why RelKit page

The docs SHALL include a Why RelKit page with honest comparisons to Encore.ts, Motia, NestJS and Hono
with tRPC or oRPC, an FAQ, and a guide for migrating from Express or Hono.

#### Scenario: Developer compares frameworks

- **WHEN** a developer opens Why RelKit
- **THEN** each comparison states where RelKit is stronger and where the alternative is

### Requirement: Labs badges

Every docs page for a Labs feature SHALL show a Labs badge on the page and in the sidebar.

#### Scenario: Realtime guide

- **WHEN** the realtime guide renders
- **THEN** it shows the Labs badge on the page and in the sidebar

### Requirement: Production and deployment guides

The docs SHALL include a guide for each Core deploy target, a self-hosting guide that does not depend
on AWS, and guides for jobs, realtime, deployment and testing.

#### Scenario: Newcomer follows the Railway guide

- **WHEN** a newcomer follows the Railway guide from a new project
- **THEN** the app deploys without steps missing from the guide

### Requirement: Benchmarks and versioning pages

The docs SHALL publish the development-loop benchmarks page and the versioning and upgrades page.

#### Scenario: Versioning page

- **WHEN** a developer opens the versioning page
- **THEN** it states the stability policy and the 1.0 criteria

### Requirement: Curated API reference

The API reference SHALL lead each page with the most-used APIs and examples, and SHALL keep the
complete generated reference available.

#### Scenario: Jobs reference

- **WHEN** a developer opens the jobs reference
- **THEN** the commonly used APIs appear first with examples, followed by the complete reference

### Requirement: Check behavior is documented

The docs SHALL state that `relkit check` imports application modules and runs their top-level code,
and which side effects the check blocks.

#### Scenario: Developer reads how check works

- **WHEN** a developer reads the `check` page
- **THEN** it explains that top-level code runs and which side effects are blocked

### Requirement: Template skill covers deployment

The agent skill shipped with templates SHALL include a deployment reference for the Core deploy
targets.

#### Scenario: Agent deploys an app

- **WHEN** a coding agent reads the template skill
- **THEN** it finds the steps to deploy to Railway
