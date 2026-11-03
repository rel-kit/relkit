/**
 * Assertion suites check declared response fields; this boundary rejects non-object JSON.
 * @typeParam Body The response fields verified by the calling suite's assertions.
 * @param response The response returned by the application fixture.
 * @returns The object whose declared fields the calling assertion suite verifies.
 */
export async function responseJson<Body extends object>(response: {
  json(): Promise<unknown>;
}): Promise<Body> {
  const body = await response.json();
  return nativeFixture<Body>(body);
}

/**
 * Admits an intentionally minimal native compatibility fixture without adding required fields.
 * @typeParam Fixture - Native contract derived by the caller from its authority's return type.
 * @param body - Original fixture value; only its non-array object boundary is checked here.
 * @returns The same object; legacy assertions remain responsible for the selected native fields.
 * @remarks This cast does not claim complete schema validation. Minimal fixtures
 * preserve pre-refactor response values and must not fabricate full-contract metadata.
 */
export function nativeFixture<Fixture extends object>(body: unknown): Fixture {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new TypeError("Expected a JSON response object");
  }
  return body as Fixture;
}
