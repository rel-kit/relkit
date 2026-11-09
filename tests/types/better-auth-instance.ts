/** The Better Auth service types its session from the application's own instance. */
import { betterAuth } from "better-auth";
import { defineBetterAuthService, type InferBetterAuthSession } from "@relkit/better-auth";

const auth = betterAuth({
  emailAndPassword: { enabled: true },
  user: { additionalFields: { plan: { type: "string", required: false } } },
});
const service = defineBetterAuthService({ auth });

type ServiceSession = InferBetterAuthSession<typeof service.handler>;
type InstanceSession = typeof auth.$Infer.Session;

const fromInstance: ServiceSession = null as unknown as InstanceSession;
const toInstance: InstanceSession = null as unknown as ServiceSession;
// The instance's additional user field reaches the session type.
const plan: string | null | undefined = toInstance.user.plan;
void fromInstance;
void plan;

// @ts-expect-error mount accepts only false
defineBetterAuthService({ auth, mount: true });
