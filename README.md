# oak-lounge-thing

Tracks the waitlists of every lounge on WaitWell (Escape Lounges in the US, UK, and Australia, plus Plaza Premium MCO) over time.

- `lib/waitwell.ts`: unofficial SDK for the lounge's WaitWell queue (status, join, leave, ticket status). See `LEARNINGS.md`.
- `lib/lounges.ts`: the lounges to track, with their WaitWell site and queue IDs.
- `index.ts`: a long-running service that records each lounge's queue length and wait time every minute into DuckDB.

Tables:
- `readings`: one row per lounge per minute, keyed by `site_id`. Times are stored as UTC instants: `round_at` is shared by every lounge in a round (use it to compare lounges at the same moment), `taken_at` is when that lounge was actually read.
- `lounges`: name, airport, time zone; rewritten from `lib/lounges.ts` at startup.
- `lounge_state_changes`: one row each time a lounge's WaitWell config changes (checked every minute): whether the queue is open or closed, today's hours, max queue size, which entry types (Priority Pass, etc.) can join online, and the full `client/state` JSON.
- `readings_local` (view): `readings` joined with `lounges`, plus `local_time`, `local_hour`, and `local_dow` (1 = Monday) in each lounge's own time zone, and the `queue_closed` and `online_join_types` in effect at that reading.

## Run

```bash
bun install
bun run index.ts   # writes to oak-lounge.duckdb; set DB_PATH to change
```

## Deploy with Docker

```bash
docker compose up -d --build   # restarts automatically unless stopped
docker compose logs -f
```

The database is stored in the `data` volume at `/data/oak-lounge.duckdb`. To analyze it, copy it out:

```bash
docker compose cp recorder:/data/oak-lounge.duckdb ./oak-lounge.duckdb
```

## Analyze

The service only opens the database for a moment each minute, so you can query it while it runs:

```bash
duckdb -readonly oak-lounge.duckdb
```

```sql
-- Average queue by local hour of day, per lounge
SELECT name, local_hour, avg(waiting) AS avg_waiting, avg(wait_minutes) AS avg_wait_min
FROM readings_local WHERE open GROUP BY ALL ORDER BY name, local_hour;
```

Close the session when done: while it is open, the service's writes fail and those minutes are skipped.
