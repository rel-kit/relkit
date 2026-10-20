# Domain service design evaluation

This is a behavioral evaluation of the application skills, separate from compiler
acceptance. Run it after changing domain-design guidance. Do not substitute a
wording assertion, service count, or a passing graph check for reviewing ownership.

The deterministic packaging check is
`bun test tests/generator/skill-consistency.test.ts --max-concurrency 1` (also
included in `bun run test:generator`). It verifies template parity and local links;
it does not run or grade an agent.

## Run protocol

1. Create an isolated temporary copy of `templates/default/v1/minimal` for each
   case. Use installed local dependencies without upgrading or installing packages.
   Never use an existing application as the evaluation destination.
2. Give a fresh agent only the selected skill, the case prompt below, the project
   path, and operational limits. For the generated skill, use the copied project's
   `.agents/skills/relkit/SKILL.md`; for `relkit-app`, use the repository skill.
   Do not give the agent this rubric, previous results, or an expected service map.
3. Ask it to implement the requested milestone in that project, using one worker,
   without servers, Git operations, network installs, or cloud resources. Record
   the agent/model identity, skill revision/hash, input prompt, plan, verification
   report, available transcript, and output files.
4. Inspect the actual `service.ts` members, operation bodies, imports, and plan.
   Run the project's graph check, typecheck, and focused tests serially. For an
   unavailable check, record the blocker and mark technical acceptance incomplete.
5. Apply every applicable criterion below with file/line evidence. Record semantic
   and technical results separately. Retain a compact result under
   `tests/agent-evals/results/`, then remove only evaluation-owned temporary files
   and stop any evaluation-owned processes.

Run both cases for the generated skill and the multi-capability case for
`relkit-app`. Fresh context matters: the agent must not inherit the investigation
that motivated the changes. Several independent runs are needed to estimate
reliability; one passing run is a smoke evaluation, not a success-rate claim.

## Case: fleet contracts

Send this prompt verbatim, without the grading section:

> Build the initial backend milestone for a multi-company logistics platform in
> this RELKIT project. It manages company onboarding and staff memberships, car
> models/cars/drivers, trip assignment and lifecycle, maintenance records, and GPS
> tracking. The eventual app uses one shared SQLite database and Better Auth.
>
> For this milestone, implement the service structure and representative validated
> public operations for those capabilities, with executable pure business rules
> and focused tests. Include trip transition validation, maintenance rejecting a
> decreasing odometer, and GPS coordinate/freshness validation. Inputs can carry
> the state needed for these pure rules. Persistence, auth activation, HTTP routes,
> live transport, and full CRUD are later milestones; do not pretend this is a
> complete platform or add infrastructure scaffolds for them now.
>
> Explain where the later atomic assignment/reservation and maintenance/car
> odometer updates will be coordinated. Keep the work local and backend-only.

Pass only when all criteria hold:

- The plan assigns capabilities, rules/state, public contracts, dependencies, and
  cross-capability consistency ownership before implementation.
- Distinct onboarding/access, fleet assets, trip dispatch/lifecycle, maintenance,
  and tracking responsibilities have cohesive service ownership. Equivalent
  names and justified groupings are acceptable; an application-wide `logistics`
  service containing all capabilities fails. Review responsibilities, not names.
- Planned owners contain real validated operations and rule implementations.
  Empty services or facades delegating every rule to one catch-all fail.
- Related fleet entities can share a service. A service per table with no
  responsibility/invariant rationale fails; do not reward maximum service count.
- Cross-service imports use the destination's public `service.ts`. Each callable
  has one owner; no foreign handler calls or re-exporting another owner's callable.
- Trip, maintenance, and GPS rules have positive and negative assertions that
  exercise the functions. Inspect assertions and run them; test names do not prove
  coverage.
- The plan identifies the owner/coordinator of assignment plus reservation and
  maintenance plus odometer consistency. It does not assume `.invoke()` propagates
  a transaction, treat an event as synchronous atomicity, or create one database,
  auth service, or migration history per domain. Planned integration is not runtime
  proof of atomicity; record that milestone limitation.
- No unsolicited frontend, cloud work, or claimed persistence/auth/realtime proof.

## Case: one coherent capability

Send this prompt verbatim in a separate fresh project:

> Implement a backend price calculator in this RELKIT project. It quotes an order
> line using quantity, unit price in integer cents, and an optional percentage
> discount. Reject invalid quantities/prices/discounts, round the discounted total
> to integer cents, and return the subtotal, discount, and total. Include focused
> success and invalid-input tests. No database, authentication, HTTP routes,
> frontend, or cloud work is needed.

Pass only when the operations and rules belong to one cohesive business service,
with executable validated calculations and positive/negative tests. Scaffolded
`hello` may remain and does not count as a business domain. Splitting quantity,
money, discounts, and totals into services without a distinct business lifecycle
fails. The skill must not force a multi-domain planning ceremony or another
approval prompt for this small request.

## Result record

Record date/revision, case, skill and hash, agent identity, actual ownership map,
criterion verdicts with source evidence, commands/results, and limitations. Mark
failed criteria explicitly; never silently revise the prompt or the implementation
after seeing the outcome. If guidance is revised, rerun with a new agent and record
both attempts. Keep evaluator-authored corrections separate from agent output.

The checked-in JSON records retain the evaluated skill/reference bytes and authored
outputs with SHA-256 hashes. They exclude dependencies and generated runtime files.
To replay a result, copy the same minimal starter into a new temporary project,
restore its `inputFiles` beneath `.agents/skills/relkit` (or use the recorded
contributor skill), and restore `outputFiles` at their project-relative paths.
Verify hashes and provision local dependency links before running the recorded
commands. Replay verifies the captured output; rerunning the prompt with a fresh
agent evaluates the skill again. Report unavailable model IDs or transcripts as
unavailable rather than inventing provenance.
