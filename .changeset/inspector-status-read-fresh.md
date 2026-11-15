---
"@relkit/inspector": patch
---

The Inspector's status read is never answered from the tab's two-second request cache, so the "application is not connected" banner appears as soon as the session stops instead of up to ten seconds later.
