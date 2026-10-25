/** Renders the shared Hello example from a Next.js App Router server page. */
import RelkitApp from "./relkit-app";

/** Keeps provider hooks inside the imported Client Component.
 * @returns The greeting within the application's existing root layout. */
export default function Page() {
  return <RelkitApp />;
}
