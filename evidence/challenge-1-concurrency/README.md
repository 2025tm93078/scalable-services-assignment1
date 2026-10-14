# Challenge 1: Concurrency Evidence

## Claim
Stock never goes below zero under concurrent requests. Exactly N requests succeed when stock is N.

## Setup
- Product created with stock = 5
- 20 parallel reservation requests fired simultaneously using Promise.all
- Each request reserves qty = 1

## Files
- `output.txt` — raw script output showing 5 succeeded, 15 got 409 INSUFFICIENT_STOCK, final stock = 0
- `db-state.txt` — DB stock table after the run confirming available = 0
- `challenge-1-concurrency.png` — screenshot of the terminal output with timestamp

## Why naive check-then-update fails
A SELECT followed by an application-level check then an UPDATE has a race window.
Two requests can both read available = 5, both pass the check, and both update — resulting in available = 3 instead of 4, or worse, going negative.

## Our fix
Single atomic UPDATE with a WHERE available >= qty condition.
If 0 rows are affected, the stock was insufficient and we return 409.
No separate SELECT. No race window.

## Result
All assertions passed: exactly 5 succeeded, 15 failed, final stock = 0.