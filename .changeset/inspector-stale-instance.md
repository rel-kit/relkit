---
"@relkit/inspector": patch
---

Recover from a stale inspector that is still running. The inspector now checks that its UI port is free before starting the UI, and fails with a clear "port is already in use" message that names the address, instead of reporting "listening" while another server answers on that port. When project history is locked by another process, a warning names the lock holder's PID and suggests `--history-directory`. After three quick attempts the inspector keeps retrying every 30 seconds, so history resumes without a restart once the other process exits. Closing the terminal (SIGHUP) now shuts the inspector down like Ctrl+C, so its UI and history worker no longer outlive it.
