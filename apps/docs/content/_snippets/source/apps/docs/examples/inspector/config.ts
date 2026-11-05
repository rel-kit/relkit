/** Explicit development inspection enables the bridge; the standalone UI is launched separately. */
import { defineApp, defineEnv } from "relkit/config";

export default defineApp({ env: defineEnv({}), inspector: { enabled: true } });
