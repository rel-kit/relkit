# Domain ownership smoke evaluation — 2026-10-20

Three fresh agents implemented the prompts in the [evaluation protocol](../domain-services.md)
in isolated copies of the minimal starter. They received the selected skill and
case, without this rubric, the original investigation, or the expected ownership
map. No model override was requested; the host model identifier and complete
internal tool transcripts were not exposed to the evaluator.

## Results

| Skill / case                       | Ownership review | New business services | Public operations |          Focused tests | Standard typecheck | Graph check              |
| ---------------------------------- | ---------------- | --------------------: | ----------------: | ---------------------: | ------------------ | ------------------------ |
| Generated skill / fleet contracts  | Pass             |                     5 |                 9 | 42 pass, 97 assertions | Pass               | Pass                     |
| Generated skill / price calculator | Pass             |                     1 |                 1 | 24 pass, 24 assertions | Pass               | Incomplete: memory guard |
| relkit-app / fleet contracts       | Pass             |                     5 |                 9 | 59 pass, 93 assertions | Pass               | Incomplete: memory guard |

The 125 focused tests passed. The generated `hello` service was preserved and is
excluded from the business-service counts. These are three smoke observations,
not a measured reliability rate or a controlled comparison with the old guidance.
Technical acceptance remains incomplete for the two interrupted graph checks.

## Ownership evidence

Both fleet runs independently created `companies`, `fleet`, `trips`, `maintenance`,
and `tracking`. The rubric accepted these responsibilities, not prescribed names.
Source evidence below refers to project-relative paths captured verbatim in the
linked JSON output records.

| Criterion                       | Verdict and inspected evidence                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plan before source              | Pass: both `plan.md` files map owned rules/state, public operations, dependencies, and later transaction coordination. The single-domain plan identifies one owner without an architecture expansion or approval request.                                                                                                                                                          |
| Distinct domain ownership       | Pass: the five `src/services/<owner>/service.ts` maps select their own nine functions. Companies owns two onboarding/membership operations; fleet owns three model/car/driver operations; trips owns assignment/transition; maintenance and tracking each own one operation.                                                                                                       |
| Real owner-local implementation | Pass: generated fleet rule bodies are in each owner's `rules.ts`, called by its functions. Contributor fleet rules live in owner-local function handlers. No catch-all implementation or empty facade appears in either output.                                                                                                                                                    |
| Cohesive grouping               | Pass: models, cars, and drivers share the fleet boundary; helper schemas and errors do not become separate services. The calculator puts quantity, money, discounts, and totals in one `pricing` operation.                                                                                                                                                                        |
| Public boundaries               | Pass for the authored milestone: service members import only their own functions; no foreign internal imports, foreign handler calls, or duplicate callable ownership. Runtime cross-service/provider composition is deferred, so it was not exercised.                                                                                                                            |
| Executable rules                | Pass: all runs test public members through `invokeFunction`. Fleet tests assert valid/invalid trip transitions, nondecreasing odometers, coordinate bounds, freshness cutoffs, and invalid inputs. Calculator tests cover eight success cases and sixteen invalid inputs. Assertions and bodies were inspected, not just test names.                                               |
| Cross-domain consistency        | Pass as a design criterion: plans assign trip/reservation coordination to trips and maintenance/car-odometer coordination to maintenance, through explicit shared-transaction operations owned by fleet. Both reject assuming `.invoke()` propagates transactions and defer rollback/contention proof to persistence work. Atomic runtime behavior is not implemented or verified. |
| Scope                           | Pass: no new database/auth instances, migration histories, business routes, frontend, cloud work, or live transport. The agents distinguish pure snapshot validation from authenticated, durable operation.                                                                                                                                                                        |

The calculator implementation is at
`src/services/pricing/functions/calculate-quote.function.ts`; its service exposes
only `calculateQuote`. It computes a rounded payable total and derives the
discount so subtotal equals discount plus total. No separate money, quantity, or
discount service was introduced.

## Captured agent output

- [Generated fleet](2026-10-20-generated-fleet.json): agent
  `/root/evaluate_generated_fleet`; evaluated skill/reference bytes, initial plan,
  27 authored source/test files, and verification report.
- [Generated single domain](2026-10-20-generated-single.json): agent
  `/root/evaluate_generated_single`; evaluated skill/reference bytes, initial plan,
  service/function/test files, and verification report.
- [Contributor fleet](2026-10-20-contributor-fleet.json): agent
  `/root/evaluate_contributor_fleet`; evaluated contributor skill/domain reference,
  initial plan, authored source/test files, and verification report.

Each record contains the base Git revision, input/output content, and SHA-256
hashes. No evaluator changed the agent-authored business code. The parent repaired
only isolated dependency links when the workspace root did not expose app/testing.
The agents corrected their own initially unsupported schema API assumptions after
inspecting installed declarations; those failed attempts remain in the reports.

The first fleet copy predates the final notification-consumer example correction
from `orders.confirmation` to `notifications.order-created`. Its ownership,
transaction guidance, and main skill are identical to the final version. The
other runs use the final reference. Event consumers are outside these cases.

## Technical checks and limitations

- The generated-fleet graph check and all three standard typechecks completed.
- Generated-single graph checks stopped at the 768 MiB and 1,024 MiB aggregate
  RSS guards; no further retry was made.
- Contributor-fleet's first graph check found authored schema errors. After
  corrections, its final check stopped at the 1,280 MiB aggregate RSS guard
  (sampled 1,376 MiB). Generated files and empty diagnostics do not constitute a
  successful check. Its standard typecheck and focused tests subsequently passed.
- All gates ran serially, with one test concurrency slot, timeouts, and resource
  checks. Heap flags and Bun `--smol` are not claimed as hard RSS limits.
- Existing local workspace builds supplied dependencies; this is not packed or
  published-package acceptance. Full builds, complete application suites, existing
  hello HTTP integration, persistence, auth, transport, and atomic rollback/race
  tests were intentionally outside this pure-rule milestone.
- Skill Creator's Python validator could not start because PyYAML is absent in
  both system and bundled Python. Bun's YAML parser successfully validated all
  six skills' frontmatter; local Markdown references and template parity passed.
- The repository generator checks passed: two tests, 1,360 assertions, including
  every template/examples/install/Git combination and the new parity/link check.
  The runner used one worker, a 60-second wall budget and 768 MiB aggregate RSS
  guard; it finished in 1.60 seconds at 238,064 KiB peak sampled RSS. Installs and
  subprocess preparation were injected by the existing matrix fixture, not run.
- Formatting and diff whitespace checks passed. No full-repository build or suite
  was needed for these guidance, evaluation, and packaging-test changes.

Temporary projects and their local dependency links were removed after artifact
capture. Agent checks reported joined process groups; the parent verified no
evaluation process remained before cleanup. No changes were made to
`logistic-platform-2` or its existing development processes.
