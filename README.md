# Scalable Services - Assignment 1 (Microservices, Node.js)

Domain: e-commerce checkout. Services: Inventory (3001), Order (3002), Payment (3003), Notification (3004), Mock gateway (3005).

## Prerequisites
Node.js 18+, Docker (for Postgres) or a local PostgreSQL 14+.

## Run
```bash
docker compose up -d                 # starts Postgres, creates 4 databases
cd services/inventory
cp .env.example .env
npm install
npm start                            # http://localhost:3001/health
```
Repeat for the other services. (Full instructions are completed at the end.)

## Test
`npm test` inside each service folder.

## Layout
`services/` code, `scripts/` challenge and e2e scripts, `evidence/` proof per challenge, `docs/` diagrams and OpenAPI.
