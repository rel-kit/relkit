/** A Better Auth file without a base URL; Better Auth warns about it once it initializes. */
import { betterAuth } from "better-auth";
import { defineBetterAuthService } from "../../src/index.ts";

export const auth = betterAuth({ emailAndPassword: { enabled: true } });

export default defineBetterAuthService({ auth });
