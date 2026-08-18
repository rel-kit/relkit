FROM oven/bun:1.3.10-alpine

WORKDIR /app
COPY server.js ./server.js

ENV PORT=3000
EXPOSE 3000
USER bun

CMD ["bun", "run", "server.js"]
