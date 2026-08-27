# @relkit/schema

`@relkit/schema` provides the default `z` builder and a Standard Schema v1
boundary for application validation. The public result keeps validation issues
structured, including their nested paths.

## Validate values

```ts
import { validateSync, z } from "@relkit/schema";

const user = z.object({
  email: z.string().email(),
  age: z.number().int().nonnegative(),
});

const result = validateSync(user, { email: "ada@example.com", age: 36 });

if ("issues" in result) {
  console.error(result.issues);
} else {
  console.log(result.value);
}
```

Use `validate` for a schema that may perform asynchronous validation:

```ts
import { validate, z } from "@relkit/schema";

const trimmed = z.string().transform(async (value) => value.trim());
const result = await validate(trimmed, "  hello  ");

if ("value" in result) console.log(result.value); // "hello"
```

Other Standard Schema-compatible values can be passed to the same validation
helpers. `getJsonSchema` returns a deterministic projection when the schema
provides one, or a structured `RELKIT_SCHEMA_UNAVAILABLE` result when it does not.

```ts
import { getJsonSchema, z } from "@relkit/schema";

const projection = getJsonSchema(z.object({ id: z.string().uuid() }));
if (projection.ok) console.log(projection.schema);
```

For buffered multipart uploads, `z.file({ maxBytes, mediaTypes })` validates the
Web `File` type and projects OpenAPI binary-string metadata. Combine it with
`http.multipart(name)` or `http.multipartAll(name)` in an explicit route
request mapping.
