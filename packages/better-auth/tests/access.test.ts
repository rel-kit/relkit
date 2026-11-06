/** Function access rules read roles and permissions from Better Auth organizations. */
import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { admin, organization } from "better-auth/plugins";
import { defineFunction } from "relkit";
import { z } from "relkit/schema";
import { invokeFunction, sessionPrincipalSource, type InvocationTarget } from "relkit/engine";
import { resolveBetterAuthAccess } from "../src/drizzle.ts";

const settings = {
  secret: "access-test-secret-access-test-secret",
  baseURL: "http://localhost",
  emailAndPassword: { enabled: true },
  plugins: [organization()],
} as const;

async function instance() {
  const database = new Database(":memory:");
  const { runMigrations } = await getMigrations({ ...settings, database });
  await runMigrations();
  return betterAuth({ ...settings, database });
}

type Instance = Awaited<ReturnType<typeof instance>>;

/** Signs a user up and returns the headers that carry their session cookie. */
async function signUp(auth: Instance, email: string): Promise<Headers> {
  const response = await auth.api.signUpEmail({
    body: { email, password: "a-long-password", name: email },
    asResponse: true,
  });
  const cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
  return new Headers({ cookie });
}

/** An owner who created the organization and a plain member, both with it active. */
async function organizationMembers(auth: Instance) {
  const owner = await signUp(auth, "owner@example.com");
  const member = await signUp(auth, "member@example.com");
  const created = await auth.api.createOrganization({
    headers: owner,
    body: { name: "Acme", slug: "acme" },
  });
  const memberSession = await auth.api.getSession({ headers: member });
  await auth.api.addMember({
    body: { organizationId: created!.id, userId: memberSession!.user.id, role: "member" },
  });
  await auth.api.setActiveOrganization({ headers: member, body: { organizationId: created!.id } });
  return { owner, member };
}

const removeMember = defineFunction({
  id: "teams.remove-member",
  input: z.object({ memberId: z.string() }),
  output: z.object({ removed: z.boolean() }),
  access: { roles: ["owner", "admin"], permissions: ["member:delete"] },
  handler: async () => ({ removed: true }),
});

function callAs(auth: Instance, headers: Headers) {
  return invokeFunction(
    removeMember as unknown as InvocationTarget,
    { memberId: "m-1" },
    {
      source: "http",
      principal: sessionPrincipalSource(
        () => auth.api.getSession({ headers }),
        (session) => resolveBetterAuthAccess(auth, session),
      ),
    },
  );
}

test("organization roles and permissions decide a function's access rule", async () => {
  const auth = await instance();
  const { owner, member } = await organizationMembers(auth);

  const ownerAccess = await resolveBetterAuthAccess(
    auth,
    await auth.api.getSession({ headers: owner }),
  );
  expect(ownerAccess.roles).toEqual(["owner"]);
  expect(await ownerAccess.hasPermission("member:delete")).toBe(true);
  const memberAccess = await resolveBetterAuthAccess(
    auth,
    await auth.api.getSession({ headers: member }),
  );
  expect(memberAccess.roles).toEqual(["member"]);
  expect(await memberAccess.hasPermission("member:delete")).toBe(false);

  await expect(callAs(auth, owner)).resolves.toEqual({ removed: true });
  await expect(callAs(auth, member)).rejects.toMatchObject({ code: "access-denied" });
});

test("a session without an active organization has no organization roles", async () => {
  const auth = await instance();
  const loner = await signUp(auth, "loner@example.com");
  const access = await resolveBetterAuthAccess(auth, await auth.api.getSession({ headers: loner }));
  expect(access.roles).toEqual([]);
  await expect(callAs(auth, loner)).rejects.toMatchObject({ code: "access-denied" });
});

test("without the organization plugin, roles come from the admin plugin's user role", async () => {
  const database = new Database(":memory:");
  const options = { ...settings, plugins: [admin()], database };
  const { runMigrations } = await getMigrations(options);
  await runMigrations();
  const auth = betterAuth(options);
  const access = await resolveBetterAuthAccess(auth as never, { user: { role: "admin,support" } });
  expect(access.roles).toEqual(["admin", "support"]);
  expect(await access.hasPermission("orders:refund")).toBe(false);
});
