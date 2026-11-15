/** A protected function, its route and a Better Auth instance whose organization roles grant
 * permissions, as a multi-tenant application declares them. The in-memory store lets a test add
 * a member with a lesser role without an invitation flow.
 */
import { defineBetterAuthService } from "@relkit/better-auth";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { organization } from "better-auth/plugins";
import { createAccessControl } from "better-auth/plugins/access";
import {
  defaultStatements,
  memberAc,
  ownerAc,
} from "better-auth/plugins/organization/access";
import { defineFunction } from "relkit/functions";
import { defineRoute } from "relkit/routes";
import { z } from "relkit/schema";

const ac = createAccessControl({ ...defaultStatements, vehicle: ["create", "read"] } as const);
const roles = {
  owner: ac.newRole({ ...ownerAc.statements, vehicle: ["create", "read"] }),
  driver: ac.newRole({ ...memberAc.statements, vehicle: ["read"] }),
};

/** Better Auth's rows by model; tests read and add rows directly. */
export const store: Record<string, Record<string, unknown>[]> = {
  user: [],
  session: [],
  account: [],
  verification: [],
  organization: [],
  member: [],
  invitation: [],
};

export const auth = defineBetterAuthService({
  auth: betterAuth({
    baseURL: "http://relkit.test",
    secret: "testing-access-rules-secret-at-least-32-bytes",
    database: memoryAdapter(store),
    emailAndPassword: { enabled: true },
    plugins: [organization({ ac, roles })],
  }),
});

/** Needs the `vehicle:create` permission; rejects an empty plate. */
export const createVehicle = defineFunction({
  id: "fleet.create-vehicle",
  input: z.object({ plate: z.string().min(1) }),
  output: z.object({ plate: z.string() }),
  access: { permissions: ["vehicle:create"] },
  handler: async ({ plate }) => ({ plate }),
});

export const vehicleRoute = defineRoute({ target: createVehicle });
