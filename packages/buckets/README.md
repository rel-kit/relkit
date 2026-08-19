# @zsys/buckets

Buckets declare logical object-storage policy. The descriptor contains no
credentials, filesystem paths, or provider client.

```ts
import { defineBucket } from "@zsys/buckets";

export default defineBucket({
  id: "assets",
  profile: "large-object",
  visibility: "private",
  maxObjectBytes: 5_000_000,
  allowedContentTypes: ["application/json", "image/*"],
});
```

The package also exports the Promise-based `BucketClient` contract used by
declared function dependencies. The engine supplies the provider and active
invocation bridge; application code receives only declared clients.
