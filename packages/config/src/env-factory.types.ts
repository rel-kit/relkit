import type { BindingValueRef } from "@relkit/provider";
import type { EnvBuilder, LiteralValue } from "./env.types.js";
import type { JsonValue } from "./env-json.types.js";

/** Public overloads for field builders and named binding references.
 * Calling without a name declares a field; passing a name creates a binding reference.
 * @example const mode = env.string(); const cache = env.secret("CACHE_URL");
 */
export interface EnvBuilderFactory {
  /** Declare a string field.
   * @returns A string builder.
   * @example env.string();
   */
  string(): EnvBuilder<string>;
  /** Reference a named string binding.
   * @param name - Binding environment name.
   * @returns A value-free string binding reference.
   * @example env.string("MODE");
   */
  string<const Name extends string>(name: Name): BindingValueRef<Name, string, "string">;
  /** Declare a finite number field.
   * @returns A number builder.
   * @example env.number();
   */
  number(): EnvBuilder<number>;
  /** Reference a named number binding.
   * @param name - Binding environment name.
   * @returns A number binding reference.
   * @example env.number("RETRIES");
   */
  number<const Name extends string>(name: Name): BindingValueRef<Name, number, "number">;
  /** Declare an exact Boolean field.
   * @returns A Boolean builder.
   * @example env.boolean();
   */
  boolean(): EnvBuilder<boolean>;
  /** Reference a named Boolean binding.
   * @param name - Binding environment name.
   * @returns A Boolean binding reference.
   * @example env.boolean("ENABLED");
   */
  boolean<const Name extends string>(name: Name): BindingValueRef<Name, boolean, "boolean">;
  /** Declare a TCP port field.
   * @returns A port builder.
   * @example env.port();
   */
  port(): EnvBuilder<number>;
  /** Reference a named port binding.
   * @param name - Binding environment name.
   * @returns A port binding reference.
   * @example env.port("SERVICE_PORT");
   */
  port<const Name extends string>(name: Name): BindingValueRef<Name, number, "port">;
  /** Declare finite literal choices.
   * @param values - Nonempty list of allowed choices.
   * @returns A literal builder.
   * @throws TypeError when a numeric choice is not finite.
   * @example env.literal("test", "production");
   */
  literal<const Values extends readonly [LiteralValue, ...LiteralValue[]]>(
    ...values: Values
  ): EnvBuilder<Values[number]>;
  /** Declare a URL field.
   * @returns A URL builder.
   * @example env.url();
   */
  url(): EnvBuilder<URL>;
  /** Reference a named URL binding.
   * @param name - Binding environment name.
   * @returns A URL binding reference.
   * @example env.url("ORIGIN");
   */
  url<const Name extends string>(name: Name): BindingValueRef<Name, URL, "url">;
  /** Declare a JSON field.
   * @returns A JSON builder.
   * @example env.json();
   */
  json(): EnvBuilder<JsonValue>;
  /** Reference a named JSON binding.
   * @param name - Binding environment name.
   * @returns A JSON binding reference.
   * @example env.json("SETTINGS");
   */
  json<const Name extends string>(name: Name): BindingValueRef<Name, JsonValue, "json">;
  /** Declare a sensitive string field.
   * @returns A secret string builder.
   * @example env.secret();
   */
  secret(): EnvBuilder<string>;
  /** Reference a named secret binding.
   * @param name - Binding environment name.
   * @returns A secret binding reference.
   * @example env.secret("API_TOKEN");
   */
  secret<const Name extends string>(name: Name): BindingValueRef<Name, string, "secret-string">;
}
