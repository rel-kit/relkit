export interface RouteParameter {
  readonly segment: string;
  readonly name: string;
  readonly kind: "path" | "path-segments";
  readonly optional: boolean;
}

export function routeParameters(path: string): readonly RouteParameter[] {
  return path.split("/").flatMap((segment) => {
    if (!segment.startsWith(":") && !segment.startsWith("*")) return [];
    const optional = segment.endsWith("?");
    return [
      {
        segment,
        name: segment.slice(1).replace(/\?$/, ""),
        kind: segment.startsWith("*") ? "path-segments" : "path",
        optional,
      },
    ];
  });
}
