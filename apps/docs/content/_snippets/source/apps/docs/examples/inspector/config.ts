/** Explicit development inspection enables the bridge; the standalone UI is launched separately. */
import { defineApp, defineEnv } from "@relkit/app/config";

export default defineApp({ env: defineEnv({}), inspector: { enabled: true } });
