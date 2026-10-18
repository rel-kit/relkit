Realtime updates are requested, so I need the missing provider choice: use a local provider for one backend instance, or Redis for fanout across instances? Also confirm the existing order access rule if updates should be private. I will keep authoritative order state in storage and use channel events for notifications once that configuration is resolved.

Status: awaiting provider/configuration selection; application files unchanged.
