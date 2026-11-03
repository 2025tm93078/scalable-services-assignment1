# Order service image  (Task 2 — Person 2: Priya)
# Build:  docker build -t order-service .
FROM node:18-alpine

WORKDIR /app

# Copy package manifests first so Docker can cache the dependency layer
COPY package*.json ./

# Install production dependencies only
RUN npm install --omit=dev

# Copy source code and the OpenAPI spec (used by Swagger UI at /api-docs)
COPY src/ ./src/
COPY openapi.yaml ./openapi.yaml

# Order service listens on port 3002
EXPOSE 3002

# Health check — lets 'docker compose ps' report (healthy)/(unhealthy)
# Uses node's built-in http module; no wget/curl needed on alpine.
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "require('http').get('http://localhost:3002/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["npm", "start"]