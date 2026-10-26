/** Adds the pulled fingerprint and a local same-origin proxy to an existing Vite React project. */
import { relkit } from "@relkit/client/build/vite";

export default {
  plugins: [relkit()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/rpc": { target: "http://127.0.0.1:3000", ws: true },
      "/_relkit": { target: "http://127.0.0.1:3000" },
    },
  },
};
