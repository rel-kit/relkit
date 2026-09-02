export function objectUrl(
  endpoint: string,
  bucket: string,
  key: string,
  pathStyle: boolean,
): string {
  const parsed = new URL(endpoint);
  const keySuffix = key === "" ? "" : `/${keyPath(key)}`;
  if (pathStyle) {
    parsed.pathname = `${parsed.pathname.replace(/\/$/, "")}/${encodeURIComponent(bucket)}${keySuffix}`;
  } else {
    parsed.hostname = `${bucket}.${parsed.hostname}`;
    parsed.pathname = `${parsed.pathname.replace(/\/$/, "")}${keySuffix || "/"}`;
  }
  return parsed.toString().replace(/\/$/, key === "" ? "/" : "");
}

export function endpointFor(value: string): string {
  const endpoint = requiredText(value, "S3 endpoint");
  const parsed = new URL(endpoint);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new TypeError("S3 endpoint must use http or https");
  }
  return parsed.toString().replace(/\/$/, "");
}

export function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${label} is invalid`);
  return value.trim();
}

function keyPath(value: string): string {
  return value.split("/").map(encodeURIComponent).join("/");
}
