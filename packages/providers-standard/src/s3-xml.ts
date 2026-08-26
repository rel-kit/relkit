export function decodeS3Xml(value: string): string {
  return value.replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">");
}

export function s3XmlValue(xml: string, name: string): string | undefined {
  return new RegExp(`<${name}>([\\s\\S]*?)<\\/${name}>`).exec(xml)?.[1];
}
