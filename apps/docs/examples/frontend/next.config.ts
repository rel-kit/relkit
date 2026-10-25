/** Embeds the pulled fingerprint and forwards local browser requests to the backend. */
import { withRelkit } from "@relkit/client/build/next";

export default withRelkit({
  /** Keeps RPC and identity requests on the frontend origin.
   * @returns Local forwarding rules; replace their destinations for production. */
  async rewrites() {
    return [
      { source: "/rpc/:path*", destination: "http://127.0.0.1:3000/rpc/:path*" },
      { source: "/_relkit/:path*", destination: "http://127.0.0.1:3000/_relkit/:path*" },
    ];
  },
});
