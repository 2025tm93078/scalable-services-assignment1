FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install --production

COPY src/ ./src/
COPY docs/ ./docs/

EXPOSE 3001

HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=5 \
  CMD node -e "require('http').get('http://localhost:3001/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "src/server.js"]