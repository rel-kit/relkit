import { Schema } from "effect";

/** Expected route filename syntax rejection, preserving its original TypeError. */
export class RouteFileError extends Schema.TaggedError<RouteFileError>()("RouteFileError", {
  cause: Schema.Defect(),
}) {}

/** Syntax variants for canonical route file segments. */
export const RouteFileSegmentSchema = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("static"), value: Schema.String }),
  Schema.Struct({
    kind: Schema.Literals(["dynamic", "catch-all", "optional-catch-all"]),
    name: Schema.String,
  }),
]);
