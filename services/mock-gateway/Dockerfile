# mock-gateway service image
FROM node:20-alpine

ENV NODE_ENV=production
WORKDIR /app

# Install dependencies first so Docker can cache this layer
COPY package*.json ./
RUN npm install --omit=dev

# Copy the application code (node_modules and .env are excluded by .dockerignore)
COPY . .

# All settings (PORT, DATABASE_URL, ...) come from environment variables at run time
EXPOSE 3005

# Lets 'docker compose ps' show (healthy) / (unhealthy)
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3005)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Do not run as root
USER node

CMD ["node", "src/index.js"]
