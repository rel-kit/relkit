/** Embeds the pulled fingerprint and forwards local browser requests to the backend. */
import { withRelkit } from "@relkit/client/build/next";

export default withRelkit({
  /** Keeps route calls and RelKit's framework requests on the frontend origin.
   * @returns Local forwarding rules, one per route path the frontend calls; replace their
   * destinations for production. */
  async rewrites() {
    return [
      { source: "/hello", destination: "http://127.0.0.1:3000/hello" },
      { source: "/_relkit/:path*", destination: "http://127.0.0.1:3000/_relkit/:path*" },
    ];
  },
});
