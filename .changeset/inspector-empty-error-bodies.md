---
"@relkit/inspector": patch
---

The Inspector no longer answers `503 remote.error-invalid` when the application returns an error or redirect with a JSON content type and an empty body. Better Auth does this for redirects such as `GET /api/auth/callback/{id}` and `GET /api/auth/reset-password/{token}`, and for disabled routes such as `POST /api/auth/delete-user`. These responses now reach the API reference with their own status and headers.
