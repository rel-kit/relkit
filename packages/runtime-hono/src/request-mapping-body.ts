import { Effect } from "effect";
import { runHttp } from "./http-effect.js";
import { RequestBodyReader, RequestBodyReaderLive } from "./request-body-service.js";
import type {
  BodyIssue,
  BodyState,
  BodyValue,
  FormDataLike,
} from "./request-mapping-body.types.js";
export type {
  BodyIssue,
  BodyIssueCode,
  BodyState,
  BodyValue,
  FormDataLike,
  Missing,
} from "./request-mapping-body.types.js";

export const MISSING = Symbol("relkit.mapping.missing");

/** Shares the request body's first JSON parse among all mapping fields.
 * @param state - State owned by the current request or operation.
 * @returns The memoized JSON value, or MISSING with any body or parsing issue.
 */
export async function parseJson(state: BodyState): Promise<BodyValue<unknown>> {
  if (state.json === undefined) state.json = parseJsonBody(state);
  return state.json;
}

/** Shares the request body's first multipart parse among all mapping fields.
 * @param state - State owned by the current request or operation.
 * @returns The memoized form data, or MISSING with any body or parsing issue.
 */
export async function parseForm(state: BodyState): Promise<BodyValue<FormDataLike>> {
  if (state.form === undefined) state.form = parseFormBody(state);
  return state.form;
}

/** Decodes bounded JSON bytes and reports malformed or incompatible input as mapping issues.
 * @param state - State owned by the current request or operation.
 * @returns The parsed JSON value, or MISSING with a bounded content-type or decoding issue.
 */
async function parseJsonBody(state: BodyState): Promise<BodyValue<unknown>> {
  const body = await readBody(state);
  if (body.issue !== undefined || body.bytes === undefined) return { value: MISSING, ...body };
  const contentType = mediaType(state.request.headers.get("content-type"));
  if (body.bytes.byteLength === 0) return { value: MISSING };
  if (contentType !== "application/json" && !contentType.endsWith("+json"))
    return {
      value: MISSING,
      issue: { code: "content-type", message: "Request content type must be application/json" },
    };
  try {
    return { value: JSON.parse(new TextDecoder().decode(body.bytes)) };
  } catch {
    return {
      value: MISSING,
      issue: { code: "malformed-json", message: "Request body is not valid JSON" },
    };
  }
}

/** Decodes bounded multipart bytes while retaining uploaded field values.
 * @param state - State owned by the current request or operation.
 * @returns Parsed multipart fields, or MISSING with a bounded content-type or decoding issue.
 */
async function parseFormBody(state: BodyState): Promise<BodyValue<FormDataLike>> {
  const body = await readBody(state);
  if (body.issue !== undefined || body.bytes === undefined) return { value: MISSING, ...body };
  if (body.bytes.byteLength === 0) return { value: MISSING };
  if (mediaType(state.request.headers.get("content-type")) !== "multipart/form-data")
    return {
      value: MISSING,
      issue: { code: "content-type", message: "Request content type must be multipart/form-data" },
    };
  try {
    const request = new Request(state.request.url, {
      method: "POST",
      headers: state.request.headers,
      body: new Uint8Array(body.bytes),
    });
    return { value: await request.formData() };
  } catch {
    return {
      value: MISSING,
      issue: { code: "malformed-multipart", message: "Request body is not valid multipart data" },
    };
  }
}

/** Shares one bounded body read across JSON and multipart mapping branches.
 * @param state - State owned by the current request or operation.
 * @returns The shared byte buffer or the body-reading issue.
 */
async function readBody(
  state: BodyState,
): Promise<{ readonly bytes?: Uint8Array; readonly issue?: BodyIssue }> {
  if (state.body !== undefined) return state.body;
  state.body = readBodyBytes(state.request, state.maxBodyBytes);
  return state.body;
}

/** Reads native request bytes through the scoped body-reader service.
 * @param request - Native request whose headers, body and cancellation signal define this operation.
 * @param maxBytes - Positive maximum number of body bytes permitted for materialization.
 * @returns The bounded bytes or reading issue produced by RequestBodyReader.
 */
async function readBodyBytes(
  request: Request,
  maxBytes: number,
): Promise<{ readonly bytes?: Uint8Array; readonly issue?: BodyIssue }> {
  return runHttp(
    Effect.gen(function* () {
      const body = yield* RequestBodyReader;
      return yield* body.read(request, maxBytes);
    }).pipe(Effect.provide(RequestBodyReaderLive)),
    request.signal,
  );
}

/** Normalizes the media type without parameters for body decoder selection.
 * @param value - Value inspected, validated or projected by this operation.
 * @returns The lowercase media type without parameters, or an empty string when absent.
 */
function mediaType(value: string | null): string {
  return value?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}
