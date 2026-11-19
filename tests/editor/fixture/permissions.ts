/** Roles and `resource:action` permissions, declared with Better Auth's access control. */
import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements, memberAc, ownerAc } from "better-auth/plugins/organization/access";

export const statement = {
  ...defaultStatements,
  order: ["create", "read", "refund"],
  report: ["read"],
} as const;

export const ac = createAccessControl(statement);
export const owner = ac.newRole({
  ...ownerAc.statements,
  order: ["create", "read", "refund"],
  report: ["read"],
});
export const clerk = ac.newRole({ ...memberAc.statements, order: ["create", "read"] });
export const roles = { owner, clerk };
