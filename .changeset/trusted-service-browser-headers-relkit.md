---
"relkit": patch
---

A request is a trusted service call only when nothing on it shows a browser sent it: it carries no `Origin`, no `Referer` and no `Sec-Fetch-Site` other than `none` or `same-origin`. A state-changing request with a session cookie and a `Referer` from another site, or with `Sec-Fetch-Site: cross-site`, used to be admitted in `relkit dev` and `relkit start` outside production because it had no `Origin`; it now answers to the origin rules, so a foreign `Referer` is refused with 403 `origin-denied` and a same-origin one is accepted. A request from `curl` or another service without those headers keeps working, and in production no request without `Origin` is a service call, as before.
