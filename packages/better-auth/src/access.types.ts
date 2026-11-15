/**
 * Role and permission names of a Better Auth instance, as types. They are read from the options
 * of the organization plugin and reach function access rules through the generated context
 * registry, so an editor suggests them and a misspelled name is a type error.
 */
import type { defaultStatements } from "better-auth/plugins/organization/access";

/** The role and permission names an access rule may use; `string` where they are not known.
 * @example type Names = BetterAuthAccess<"owner" | "member", "order:create">;
 */
export interface BetterAuthAccess<
  Roles extends string = string,
  Permissions extends string = string,
> {
  readonly roles: Roles;
  readonly permissions: Permissions;
}

/** The options of the organization plugin among an instance's plugins, or `never`. */
type OrganizationOf<Options> = Options extends { readonly plugins?: infer Plugins }
  ? Plugins extends readonly (infer Plugin)[]
    ? Plugin extends { readonly id: "organization"; readonly options: infer Organization }
      ? Organization
      : never
    : never
  : never;

/** The statements of the plugin's access control, or the plugin's own when none is passed. */
type StatementsOf<Organization> = Organization extends {
  readonly ac: { readonly statements: infer Statements };
}
  ? Statements
  : typeof defaultStatements;

/**
 * The names of a Better Auth instance's access control, from the type of its options.
 * Without the organization plugin both are `string`: roles then come from `user.role` and no
 * permission is granted. With `dynamicAccessControl` roles are created at run time and are
 * `string`. The two unions are written inline so that a type error lists the names.
 * @example type Names = BetterAuthAccessOf<typeof auth.options>;
 */
export type BetterAuthAccessOf<Options> = [OrganizationOf<Options>] extends [never]
  ? BetterAuthAccess
  : OrganizationOf<Options> extends infer Organization
    ? StatementsOf<Organization> extends infer Statements
      ? BetterAuthAccess<
          Organization extends { readonly dynamicAccessControl: { readonly enabled: true } }
            ? string
            : Organization extends { readonly roles: infer Roles extends object }
              ? Extract<keyof Roles, string>
              : "owner" | "admin" | "member",
          {
            [
              Resource in keyof Statements & string
            ]: Statements[Resource] extends readonly (infer Action extends string)[]
              ? `${Resource}:${Action}`
              : never;
          }[keyof Statements & string]
        >
      : never
    : never;
