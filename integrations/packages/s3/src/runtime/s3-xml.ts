export function decodeS3Xml(value: string): string {
  return value.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");
}

export function s3XmlValue(xml: string, name: string): string | undefined {
  return new RegExp(`<${name}>([\\s\\S]*?)<\\/${name}>`).exec(xml)?.[1];
}

export function s3ErrorDetail(body: string): string | undefined {
  const xml = [s3XmlValue(body, "Code"), s3XmlValue(body, "Message")]
    .filter((value): value is string => value !== undefined)
    .map(decodeS3Xml);
  if (xml.length > 0) return xml.join(": ").slice(0, 500);
  const text = body.trim().replace(/\s+/g, " ");
  if (text === "") return undefined;
  try {
    const value = JSON.parse(text) as Record<string, unknown>;
    const detail = [value.code, value.message, value.error].find(
      (entry): entry is string => typeof entry === "string" && entry.trim() !== "",
    );
    return detail?.slice(0, 500) ?? text.slice(0, 500);
  } catch {
    return text.slice(0, 500);
  }
}
