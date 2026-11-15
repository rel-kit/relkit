---
"relkit": patch
---

On Node, a request whose client sent no body (no `Transfer-Encoding`, and no `Content-Length` or `Content-Length: 0`) now reaches route and mounted handlers with `request.body === null`, as on Bun. The Node listener used to give every request other than `GET` and `HEAD` an empty body stream, so Better Auth's sign-out (a `POST` without a body or content type) answered 415 `UNSUPPORTED_MEDIA_TYPE` under `relkit start` and `relkit dev` on Node. The request keeps its method, URL, headers and signal.
