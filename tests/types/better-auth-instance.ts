/** The Better Auth service types its session from the application's own instance. */
import { betterAuth } from "better-auth";
import { createAccessControl } from "better-auth/plugins/access";
import { organization } from "better-auth/plugins/organization";
import {
  defineBetterAuthService,
  type InferBetterAuthAccess,
  type InferBetterAuthSession,
} from "@relkit/better-auth";

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

// The service's handler type carries the role and permission names of the instance's access
// control; the generated context registry types function access rules with them.
const ac = createAccessControl({ order: ["create", "refund"], report: ["read"] } as const);
const manager = ac.newRole({ order: ["create", "refund"] });
const clerk = ac.newRole({ order: ["create"] });
const withAccess = defineBetterAuthService({
  auth: betterAuth({ plugins: [organization({ ac, roles: { manager, clerk } })] }),
});
type Declared = InferBetterAuthAccess<typeof withAccess.handler>;
const declaredRoles: Declared["roles"][] = ["manager", "clerk"];
const declaredPermissions: Declared["permissions"][] = [
  "order:create",
  "order:refund",
  "report:read",
];
// @ts-expect-error a role the plugin's `roles` does not declare
const undeclaredRole: Declared["roles"] = "owner";
// @ts-expect-error an action the statement does not declare for the resource
const undeclaredPermission: Declared["permissions"] = "order:delete";
void [declaredRoles, declaredPermissions, undeclaredRole, undeclaredPermission];

// Without `ac` and `roles` the plugin's own roles and statements apply.
const plain = defineBetterAuthService({ auth: betterAuth({ plugins: [organization()] }) });
type Defaults = InferBetterAuthAccess<typeof plain.handler>;
const defaultRoles: Defaults["roles"][] = ["owner", "admin", "member"];
const defaultPermission: Defaults["permissions"] = "member:create";
// @ts-expect-error not one of the plugin's roles
const notADefaultRole: Defaults["roles"] = "manager";
void [defaultRoles, defaultPermission, notADefaultRole];

// Roles created at run time cannot be listed, so any string is a role.
const dynamic = defineBetterAuthService({
  auth: betterAuth({
    plugins: [organization({ ac, dynamicAccessControl: { enabled: true } })],
  }),
});
type Dynamic = InferBetterAuthAccess<typeof dynamic.handler>;
const laterRole: Dynamic["roles"] = "created-later";
// @ts-expect-error permissions still come from the statement
const laterPermission: Dynamic["permissions"] = "order:delete";
void [laterRole, laterPermission];

// Without the organization plugin nothing is known, and both are `string`.
type Unknown = InferBetterAuthAccess<typeof service.handler>;
const anyRole: string extends Unknown["roles"] ? true : false = true;
const anyPermission: string extends Unknown["permissions"] ? true : false = true;
void [anyRole, anyPermission];
