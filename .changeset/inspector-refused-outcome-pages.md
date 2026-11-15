---
"@relkit/inspector": patch
---

The Requests filter offers "Refused by the framework" for requests the framework answered before any route ran (an unknown path, a wrong method, a body over the limit), and shows them in the warning tone, not as failures. An action that never reached the application, such as a retry the provider cannot do, no longer says it ran without a user session.
