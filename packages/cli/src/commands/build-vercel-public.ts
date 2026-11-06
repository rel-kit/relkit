/**
 * The file `relkit build --target vercel` leaves in the public output directory. Vercel rejects a
 * deployment whose output directory is empty ("The Output Directory is empty"), and a project with
 * no `public/` of its own would deploy exactly that; the file keeps the directory non-empty and is
 * served statically at a path the function never owns.
 */

/** Path inside the staged `public/` directory. */
export const VERCEL_PUBLIC_PLACEHOLDER = "_relkit/vercel-output.txt";

/** Contents of the placeholder. */
export const VERCEL_PUBLIC_PLACEHOLDER_TEXT =
  "RelKit serves this directory from Vercel's CDN; add files to the project's public/ directory to publish them.\n";
