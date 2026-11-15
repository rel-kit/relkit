---
"relkit": patch
---

Fixed: a channel guard that calls `getRelkit()` (for example to look a membership up in the
database) refused a signed-in user over the WebSocket transport with `NOT_FOUND`, on Node and on
Bun, while the same user was served over the HTTP stream. Socket messages arrived outside the
asynchronous context of the upgrade request, so `getRelkit()` threw and the guard's failure was
concealed as a refusal. Each message now runs in the upgrade request's context.
