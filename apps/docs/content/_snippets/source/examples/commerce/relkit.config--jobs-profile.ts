jobs: { default: docker(inngest()) },
defaults: {
  bucket: "assets",
  cache: "requests",
  realtime: "default",
  "agent-state": "agents",
  jobs: "default",
},
