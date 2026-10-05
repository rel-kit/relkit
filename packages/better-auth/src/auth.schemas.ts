import { Schema } from "effect";

/** Auth route prefixes exclude trailing slashes and dynamic route markers. */
export const AuthBasePath = Schema.String.check(
  Schema.makeFilter(
    (value) =>
      value.startsWith("/") && !value.endsWith("/") && !value.includes("*") && !value.includes("["),
  ),
);
