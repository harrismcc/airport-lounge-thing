# airport-lounge-thing

Records the waitlist of every airport lounge on WaitWell every minute into a DuckDB database, so you can analyze how busy each lounge gets over time. It covers 32 lounges: Escape Lounges in the US, UK, and Australia, plus Plaza Premium at MCO.

## Run it

You need Docker. The image is public, so there's nothing to clone or log in to:

```bash
docker run -d --name lounge-recorder --restart unless-stopped \
  -v lounge-data:/data ghcr.io/harrismcc/airport-lounge-thing:latest
```

It takes a reading of every lounge right away, then once a minute, and keeps running (and restarts after a crash or reboot) until you stop it. The database lives in the `lounge-data` volume, so it survives restarts and upgrades.

| To | Run |
| --- | --- |
| Watch it work | `docker logs -f lounge-recorder` |
| Copy the database out to analyze | `docker cp lounge-recorder:/data/lounges.duckdb .` |
| Stop it | `docker stop lounge-recorder` |
| Upgrade to the latest image | `docker pull ghcr.io/harrismcc/airport-lounge-thing:latest && docker rm -f lounge-recorder`, then the `docker run` command above |

Every push to `main` publishes a new `latest` image (amd64 and arm64).

### With Docker Compose

From a clone of this repo, `compose.yaml` runs the same image with a `data` volume:

```bash
docker compose pull && docker compose up -d
docker compose logs -f
docker compose cp recorder:/data/lounges.duckdb .
```

Use `docker compose up -d --build` to build the image from your checkout instead.

### Without Docker

With [Bun](https://bun.com) installed:

```bash
bun install
bun run index.ts   # writes to lounges.duckdb; set DB_PATH to change
```

## Analyze

Open the database with the [DuckDB CLI](https://duckdb.org/docs/installation/):

```bash
duckdb -readonly lounges.duckdb
```

```sql
-- Average queue by local hour of day, per lounge
SELECT name, local_hour, avg(waiting) AS avg_waiting, avg(wait_minutes) AS avg_wait_min
FROM readings_local WHERE open GROUP BY ALL ORDER BY name, local_hour;
```

When running without Docker, you can query the live file: the service only opens it for a moment each minute. Close your session when done, though; while it is open, the service's writes fail and those minutes are skipped.

### Tables

- `readings`: one row per lounge per minute, keyed by `site_id`. Times are stored as UTC instants: `round_at` is shared by every lounge in a round (use it to compare lounges at the same moment), `taken_at` is when that lounge was actually read. `seconds_per_position` is WaitWell's estimate of how long each person ahead of you adds.
- `lounges`: name, airport, time zone; rewritten from `lib/lounges.ts` at startup.
- `lounge_state_changes`: one row each time a lounge's WaitWell config changes (checked every minute): whether the queue is open or closed, today's hours, max queue size, which entry types (Priority Pass, etc.) can join online, and the full `client/state` JSON.
- `readings_local` (view): `readings` joined with `lounges`, plus `local_time`, `local_hour`, and `local_dow` (1 = Monday) in each lounge's own time zone, and the `queue_closed` and `online_join_types` in effect at that reading.

## Code

- `index.ts`: the recording service.
- `lib/lounges.ts`: the lounges to track, with their WaitWell site and queue IDs.
- `lib/waitwell.ts`: unofficial WaitWell SDK: queue status and config for any lounge; join, leave, and ticket status for OAK only. See `LEARNINGS.md` for how the API works.
