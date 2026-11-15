/** A direct `invokeFunction` call checks the function's access rule too. It has no HTTP request,
 * so its caller is the explicit `principal`, else the context's `auth.getSession()` session:
 * none by default, and a session read that way carries roles but no permissions.
 */
import { expect, test } from "bun:test";
import type { AccessPrincipal } from "relkit/contracts";
import { invokeFunction } from "../../src/invoke-function.js";
import { createVehicle } from "../fixtures/access-auth-resource.js";

const session = { user: { id: "user-1" }, session: { activeOrganizationId: "fleet" } };

/** A signed-in caller holding the given permissions. */
function user(...permissions: string[]): () => Promise<AccessPrincipal<unknown>> {
  return async () => ({
    kind: "user",
    session,
    roles: [],
    hasPermission: async (permission) => permissions.includes(permission),
  });
}

test("without a principal or session, a direct call is anonymous", async () => {
  await expect(invokeFunction(createVehicle, { plate: "AB-123" })).rejects.toMatchObject({
    id: "unauthenticated",
  });
});

test("a context session is the caller, with no permissions", async () => {
  await expect(
    invokeFunction(
      createVehicle,
      { plate: "AB-123" },
      {
        context: (base) => ({ ...base, auth: { getSession: async () => session } }) as never,
      },
    ),
  ).rejects.toMatchObject({ id: "access-denied" });
});

test("an explicit principal decides the rule", async () => {
  await expect(
    invokeFunction(createVehicle, { plate: "AB-123" }, { principal: user("vehicle:read") }),
  ).rejects.toMatchObject({ id: "access-denied" });
  await expect(
    invokeFunction(createVehicle, { plate: "AB-123" }, { principal: user("vehicle:create") }),
  ).resolves.toEqual({ plate: "AB-123" });
  await expect(
    invokeFunction(
      createVehicle,
      { plate: "AB-123" },
      { principal: async () => ({ kind: "system" }) },
    ),
  ).resolves.toEqual({ plate: "AB-123" });
});
