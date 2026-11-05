/**
 * The CLI's private TypeScript 5.9 compiler API for codemods, source scanning and RelKit's own
 * semantic checks, from the private `relkit-typescript` workspace package (`tools/typescript-api`),
 * which the build bundles into `dist/typescript-parser.js`. The application's `typescript`
 * dependency (5.9 or 7, whose package has no JavaScript compiler API) never constrains these
 * tools. Import it in place of `typescript`:
 * `import ts from "../typescript-parser.js"`; type-checking the application itself runs the
 * application's own compiler binary instead.
 */
import ts from "relkit-typescript";

export default ts;
