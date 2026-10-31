---
"@relkit/cli": patch
"@relkit/inspector": patch
---

Redesign the Inspector application graph as a hierarchical explorer. The default view shows route groups, domains, events and channels with auth and the database in a side column; a domain view opens one domain's routes, functions and neighbours; a flow view follows a request from route through middleware, handler, calls, tables, events, listeners and realtime channels to its response. Routes behind middleware carry a lock with the ordered middleware names, selecting a card lights its full downstream path, and an icon bar shows only the selected kinds. Agent graphs move under a new AI sidebar group.
