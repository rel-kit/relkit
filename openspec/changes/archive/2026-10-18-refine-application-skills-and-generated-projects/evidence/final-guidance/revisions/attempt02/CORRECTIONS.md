# Attempt 02: correction after real parent execution

Observed failure source: ../attempt01/guidance01-check.log, copied byte-for-byte from evidence/acceptance/guidance01-check.log. The original app, manifests, diffs and plan are preserved in ../attempt01. This attempt changes authored fixtures only; no shipped skill/template files changed.

## Confirmed original authoring errors

- I re-exported AuthenticationRequired and requireUser from the specialized auth service.ts. The parent's actual check reported RELKIT_DUPLICATE_ID for auth.required and RELKIT_DOMAIN_INVALID because a service boundary must export one runtime service value.
- I declared AuthenticationRequired in each function's errors list but threw it inside requireUser. The handler inferred return type did not include that declared failure, so the actual check rejected all three handlers with __relkit_handler_error__.
- These are errors in my initial fixture, not passing behavior. The original source was never verified and is retained unchanged in attempt01.

## Exact corrections authored

1. Restored src/services/auth/service.ts to its original default-only defineBetterAuthService source. Its protocol ALL route, auth schema and database singleton remain unchanged.
2. Removed the unsupported cross-domain auth helper/error re-export and its original helper file from the active fixture; attempt01 retains it.
3. Added one default error descriptor inside each resource domain:
   - users/errors/authentication-required.error.ts with ID users.authentication-required
   - orders/errors/authentication-required.error.ts with ID orders.authentication-required
4. Added ordinary readCurrentUser helpers inside users and orders. They validate the native session and return a user or null. They create/export no descriptors and throw no declared errors.
5. Each function imports its own domain's error/helper. Its null-user branch explicitly returns fail(AuthenticationRequired, {}) from @relkit/app/functions. This preserves the declared failure in the inferred handler result.
6. Kept the HTTP test source and all ownership/storage behavior unchanged. Runtime assertions still need to execute.

Installed API evidence: packages/functions/dist/handler-result.d.ts exports fail and documents return fail(NotFound, { id: "one" }); packages/functions/dist/index.d.ts re-exports handler-result, and packages/app/dist/functions.d.ts re-exports @relkit/functions. Source/type examples in tests/types/function-context.ts show the same public failure return contract.

case01-correction.diff and authored-hashes.json record the corrected source. Root case01/changes.diff remains the full initial-baseline-to-current delta; the overwritten initial diff is preserved under attempt01.

## Case 02 inspection

The fullstack fixture has one default service runtime export, no declared-error list, no thrown declared error and no descriptor re-export through service.ts. The hello handler returns only its schema-compatible success value. It does not share the two case01 defects. Its source is unchanged from attempt01; case02-correction.diff is empty. This is source inspection only, not a graph/typecheck/browser result.

## Small shipped-guidance correction recommended

Yes: the real failed authoring demonstrates two non-obvious contracts worth a narrow clarification in references/domain-apis.md after certification. No shipped file was modified during active certification.

Suggested service paragraph:
"Each service.ts constructs and exports exactly one runtime service value. Do not re-export ordinary helpers, function descriptors or error descriptors from it. Expose callable domain operations through defineService({ functions: ... }); keep ordinary helpers inside the owning domain."

Suggested expected-error example:
```ts
import { defineFunction, fail } from "@relkit/app/functions";
import AuthenticationRequired from "../errors/authentication-required.error.js";

// Within a function that declares errors: [AuthenticationRequired]:
handler: async (_input, context) => {
  const session = await context.auth.getSession();
  if (session === null) return fail(AuthenticationRequired, {});
  return { id: session.user.id };
}
```

The surrounding text should explain that every listed expected error must appear in the inferred handler failure return type; throwing it in an ordinary helper does not satisfy that authoring contract. Use the public fail helper for plain TypeScript handlers.

This recommendation is supported by actual compiler/type errors, not by a wording-match test. Existing cross-domain/service-boundary guidance need not be broadened.

## Verification state

No tests, check, typecheck, build, install, server or browser was run by this child during the correction. Parent must rerun its bounded current-package check/typecheck and then the same HTTP/browser acceptance. No pass result is claimed. No process was started that requires cleanup.
