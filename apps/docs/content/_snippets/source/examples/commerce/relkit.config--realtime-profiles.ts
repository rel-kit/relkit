realtime: docker(redisRealtime({ url: binding.secret("REALTIME_REDIS_URL") })),
"agent-state": {
  agents: docker(redisAgentState({ url: binding.secret("AGENT_STATE_REDIS_URL") })),
},
