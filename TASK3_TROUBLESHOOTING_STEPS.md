# Task 3: Troubleshooting challenge (Person 3)

Problem chosen: **wrong environment variable** (DB host `localhost` instead of the container name `postgres`).

Run every command from the repo root in Git Bash. Stop the locally running `npm start` services first
(they use ports 3003-3005), and stop any other container that already uses 5433.

## 0. Working baseline (take this screenshot first)
    docker compose -f docker-compose.troubleshoot.yml up -d --build
    docker compose -f docker-compose.troubleshoot.yml ps
    curl localhost:3003/health
Expect: postgres, mock-gateway, payment, notification all Up, payment and notification (healthy).

## 1. Break it
In docker-compose.troubleshoot.yml, in the payment service, change
    DATABASE_URL: postgres://payment_user:payment_pass@postgres:5432/payment_db
to
    DATABASE_URL: postgres://payment_user:payment_pass@localhost:5432/payment_db
then:
    docker compose -f docker-compose.troubleshoot.yml up -d
Compose recreates only payment.

## 2. Show the symptom
    docker compose -f docker-compose.troubleshoot.yml ps -a
    curl localhost:3003/health
Expect: payment is Exited (1) (or Restarting), notification still healthy, curl fails to connect.

## 3. Diagnose
    docker compose -f docker-compose.troubleshoot.yml logs payment
Expect: "failed to start" with "connect ECONNREFUSED ..." (inside the container, localhost is the container itself, not Postgres).

    docker compose -f docker-compose.troubleshoot.yml ps -a
    docker inspect <payment-container-name> --format "{{.State.Status}} exit={{.State.ExitCode}}"
    docker inspect <payment-container-name> --format "{{range .Config.Env}}{{println .}}{{end}}"
The container name is in the first column of `ps -a` (for example scalable-services-assignment1-payment-1).
Point at: exit code 1, and DATABASE_URL containing @localhost.

Optional extra proof the database itself is fine:
    docker compose -f docker-compose.troubleshoot.yml ps postgres

## 4. Fix
Change @localhost back to @postgres in docker-compose.troubleshoot.yml, then:
    docker compose -f docker-compose.troubleshoot.yml up -d

## 5. Validate (take this screenshot)
    docker compose -f docker-compose.troubleshoot.yml ps
    curl localhost:3003/health
    command node scripts/idempotency-test.js
Expect: payment (healthy), health answers UP, RESULT: ALL CHECKS PASSED.

## Clean up
    docker compose -f docker-compose.troubleshoot.yml down -v
