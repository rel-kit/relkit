---
"@relkit/cli": patch
---

`relkit dev` run by Node now serves a same-origin `POST`, `PUT`, `PATCH` or `DELETE`. Node's
`fetch` replaces the `Host` header the development proxy forwards with the worker's private
address, so the worker judged every browser `Origin` as foreign and answered 403 `origin-denied`.
On Node the proxy now forwards over `node:http`, which keeps `Host`, as Bun's `fetch` already did.
Cross-origin requests are still denied, and forwarding headers sent by the client are not trusted.

`relkit dev` run by Node now accepts a same-origin WebSocket, so realtime channels and the RPC
socket work from a browser. Node's `WebSocket` client also replaced `Host` on the proxy's upstream
socket, so the worker refused every browser socket and the development server answered 502. On
Node the proxy now opens that socket with `ws`, which keeps `Host` and forwards the browser's
cookies and `Origin`; Bun keeps its own client. Cross-origin sockets are still refused.

The development proxy no longer invents a request body: a request whose client sent none (no
`Transfer-Encoding`, and no `Content-Length` or `Content-Length: 0`) is forwarded without one,
where on Node it used to be forwarded as an empty chunked body, so Better Auth's sign-out answered
415 under `relkit dev` on Node.

`relkit dev` run by Node now delivers the worker's answer to a request whose body the worker
refused early, such as a 413 for a body over `server.maxBodyBytes`. The proxy's Node client waited
for the whole body to be sent first, so a large body could hang until the client gave up, and a
write error before the answer was read turned it into the proxy's own `500`. The answer is now
delivered once the worker ends its side or still holds the body back after a short grace; the
rest of the body is not sent and the client's connection is closed after the answer. The proxy
also stops forwarding the worker's connection headers (`Connection`, `Keep-Alive`,
`Transfer-Encoding`), so a client's `Connection: close` is honoured.
