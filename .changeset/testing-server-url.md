---
"@relkit/testing": minor
---

`createTestApplication` sends `testApp.http` requests to a running server when `RELKIT_TEST_SERVER_URL` is set, so an application's HTTP tests can check its production build on Bun or Node. Requests without an `Origin` header get the server's own origin, as a browser on the app would send. Members that need the in-process application, such as `testApp.runtime` and `testApp.fakes`, throw an explanation in that mode.
