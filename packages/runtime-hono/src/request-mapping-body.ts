export const MISSING = Symbol("relkit.mapping.missing");
export type Missing = typeof MISSING;
export type BodyIssueCode =
  "content-type" | "body-too-large" | "malformed-json" | "malformed-multipart";
export interface BodyIssue {
  readonly code: BodyIssueCode;
  readonly message: string;
}
export interface FormDataLike {
  readonly getAll: (name: string) => readonly unknown[];
}
export interface BodyValue<T> {
  readonly value: T | Missing;
  readonly issue?: BodyIssue;
}
export interface BodyState {
  readonly request: Request;
  readonly maxBodyBytes: number;
  body?: Promise<{ readonly bytes?: Uint8Array; readonly issue?: BodyIssue }>;
  json?: Promise<BodyValue<unknown>>;
  form?: Promise<BodyValue<FormDataLike>>;
}

export async function parseJson(state: BodyState): Promise<BodyValue<unknown>> {
  if (state.json === undefined) state.json = parseJsonBody(state);
  return state.json;
}

export async function parseForm(state: BodyState): Promise<BodyValue<FormDataLike>> {
  if (state.form === undefined) state.form = parseFormBody(state);
  return state.form;
}

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

async function readBody(
  state: BodyState,
): Promise<{ readonly bytes?: Uint8Array; readonly issue?: BodyIssue }> {
  if (state.body !== undefined) return state.body;
  state.body = readBodyBytes(state.request, state.maxBodyBytes);
  return state.body;
}

async function readBodyBytes(
  request: Request,
  maxBytes: number,
): Promise<{ readonly bytes?: Uint8Array; readonly issue?: BodyIssue }> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1)
    throw new RangeError("maxBodyBytes must be a positive integer");
  const length = Number(request.headers.get("content-length"));
  if (Number.isSafeInteger(length) && length > maxBytes)
    return { issue: { code: "body-too-large", message: `Request body exceeds ${maxBytes} bytes` } };
  if (request.body === null) return { bytes: new Uint8Array() };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    total += part.value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return {
        issue: { code: "body-too-large", message: `Request body exceeds ${maxBytes} bytes` },
      };
    }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes };
}

function mediaType(value: string | null): string {
  return value?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}
