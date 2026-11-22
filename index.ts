// Records every lounge's WaitWell queue every minute into DuckDB for analysis.
import { DuckDBInstance, listValue, type DuckDBConnection, type DuckDBValue } from "@duckdb/node-api";
import { LOUNGES, OAK, type Lounge } from "./lib/lounges";
import { getQueueStatus, getSiteState } from "./lib/waitwell";

const DB_PATH = process.env.DB_PATH ?? "lounges.duckdb";

// DuckDB lets only one process open a file for writing, so open it per reading
// to leave it free for queries (e.g. the duckdb CLI) between readings.
async function withDb<T>(fn: (db: DuckDBConnection) => Promise<T>): Promise<T> {
  const instance = await DuckDBInstance.create(DB_PATH);
  const db = await instance.connect();
  try {
    return await fn(db);
  } finally {
    db.closeSync();
    instance.closeSync();
  }
}

// Latest stored state JSON per site, so a state row is written only when it changes.
const lastState = new Map<number, string>();

// The client/state fields worth tracking, plus the full response with the fields that change on
// every call removed, so it only differs when the lounge's config actually changes.
function stateRow(lounge: Lounge, data: any, takenAt: string): DuckDBValue[] {
  delete data.Location.key; // new on every call
  for (const q of data.Queues) {
    delete q.MinsTillQueueClosed; // count down every minute
    delete q.MinsTillLocationClosed;
    delete q.NumberWaiting; // live queue values, recorded in readings instead
    delete q.CurrentWaitTime;
    delete q.TimePerPositionEstimate;
    q.QueueHours = Object.values(q.QueueHours ?? {}); // keyed by today's date; a new day alone isn't a change
  }
  const queue = data.Queues.find((q: any) => q.id === lounge.queueId);
  const hours = queue?.QueueHours[0];
  const joinTypes = data.JoinServiceTypes.filter(
    (t: any) => t.Queue_id === lounge.queueId && t.Enabled && t.AllowOnlineJoin && !t.Hidden,
  ).map((t: any) => t.Name);
  return [
    takenAt,
    lounge.siteId,
    queue ? Boolean(queue.QueueOpen) : null,
    queue ? queue.QueueClosed === 1 : null,
    queue?.MaxQueueSize ?? null,
    hours?.OpenTime ?? null,
    hours?.CloseTime ?? null,
    listValue(joinTypes),
    JSON.stringify(data),
  ];
}

async function takeReadings() {
  // Shared by every lounge in this round, so cross-lounge comparisons line up exactly.
  const roundAt = new Date().toISOString();
  const rows: DuckDBValue[][] = [];
  const stateRows: DuckDBValue[][] = [];
  // One lounge at a time so WaitWell doesn't see a burst of requests.
  for (const lounge of LOUNGES) {
    const takenAt = new Date().toISOString();
    // Same timestamp as the reading, so the reading joins to the state it was taken under.
    let secondsPerPosition = null;
    try {
      const data = await getSiteState(lounge);
      secondsPerPosition = data.Queues.find((q: any) => q.id === lounge.queueId)?.TimePerPositionEstimate ?? null;
      const row = stateRow(lounge, data, takenAt);
      const json = row.at(-1) as string;
      if (lastState.get(lounge.siteId) !== json) {
        stateRows.push(row);
        lastState.set(lounge.siteId, json);
      }
    } catch (err) {
      console.error(takenAt, `${lounge.name} state failed:`, err);
    }
    try {
      const s = await getQueueStatus(lounge);
      rows.push([roundAt, takenAt, lounge.siteId, s.open, s.waiting, s.waitMinutes, s.message, secondsPerPosition]);
    } catch (err) {
      console.error(takenAt, `${lounge.name} reading failed:`, err);
    }
  }
  await withDb(async (db) => {
    await db.run("BEGIN");
    for (const row of rows) {
      await db.run(
        "INSERT INTO readings (round_at, taken_at, site_id, open, waiting, wait_minutes, message, seconds_per_position) VALUES ($1::TIMESTAMPTZ, $2::TIMESTAMPTZ, $3, $4, $5, $6, $7, $8)",
        row,
      );
    }
    for (const row of stateRows) {
      await db.run(
        "INSERT INTO lounge_state_changes VALUES ($1::TIMESTAMPTZ, $2, $3, $4, $5, $6, $7, $8, $9)",
        row,
      );
    }
    await db.run("COMMIT");
  });
  console.log(
    `${new Date().toISOString()} recorded ${rows.length}/${LOUNGES.length} lounges, ${stateRows.length} state changes`,
  );
}

await withDb(async (db) => {
  await db.run(`CREATE TABLE IF NOT EXISTS readings (
    taken_at TIMESTAMPTZ NOT NULL,
    open BOOLEAN,
    waiting INTEGER,
    wait_minutes INTEGER,
    message VARCHAR
  )`);
  // Readings from before multi-lounge support are all OAK.
  await db.run(`ALTER TABLE readings ADD COLUMN IF NOT EXISTS site_id INTEGER DEFAULT ${OAK.siteId}`);
  // Older readings were taken one per round, so their own time is their round time.
  await db.run("ALTER TABLE readings ADD COLUMN IF NOT EXISTS round_at TIMESTAMPTZ");
  await db.run("UPDATE readings SET round_at = taken_at WHERE round_at IS NULL");
  // WaitWell's per-person wait estimate (client/state TimePerPositionEstimate); it varies by lounge, likely from recent throughput.
  await db.run("ALTER TABLE readings ADD COLUMN IF NOT EXISTS seconds_per_position INTEGER");
  await db.run(`CREATE OR REPLACE TABLE lounges (
    site_id INTEGER PRIMARY KEY,
    queue_id INTEGER,
    airport VARCHAR,
    name VARCHAR,
    time_zone VARCHAR
  )`);
  for (const l of LOUNGES) {
    await db.run("INSERT INTO lounges VALUES ($1, $2, $3, $4, $5)", [l.siteId, l.queueId, l.airport, l.name, l.timeZone]);
  }
  // One row per lounge each time its config changes; changed_at is the first reading that saw it.
  await db.run(`CREATE TABLE IF NOT EXISTS lounge_state_changes (
    changed_at TIMESTAMPTZ NOT NULL,
    site_id INTEGER NOT NULL,
    queue_open BOOLEAN,
    queue_closed BOOLEAN,
    max_queue_size INTEGER,
    open_time VARCHAR,
    close_time VARCHAR,
    online_join_types VARCHAR[],
    state JSON
  )`);
  const latest = await db.runAndReadAll(
    "SELECT site_id, arg_max(state, changed_at)::VARCHAR AS state FROM lounge_state_changes GROUP BY site_id",
  );
  for (const [siteId, state] of latest.getRows()) {
    lastState.set(Number(siteId), JSON.stringify(JSON.parse(String(state))));
  }
  // Local time is derived at query time so DST is handled and a corrected time zone fixes all history.
  await db.run(`CREATE OR REPLACE VIEW readings_local AS
    SELECT r.*, l.airport, l.name, l.time_zone,
      r.taken_at AT TIME ZONE l.time_zone AS local_time,
      hour(local_time) AS local_hour,
      isodow(local_time) AS local_dow, -- 1 = Monday, 7 = Sunday
      s.queue_closed, s.online_join_types
    FROM readings r JOIN lounges l USING (site_id)
    ASOF LEFT JOIN lounge_state_changes s ON s.site_id = r.site_id AND r.taken_at >= s.changed_at`);
});

// Log failed runs and keep going; Bun.cron exits the process on an unhandled rejection otherwise.
const safeReadings = () => takeReadings().catch((err) => console.error(new Date().toISOString(), "readings failed:", err));

// As a container's PID 1, Bun ignores SIGTERM unless it has a handler, so `docker stop` would hang until killed.
process.on("SIGTERM", () => process.exit(0));

await safeReadings();
Bun.cron("* * * * *", safeReadings);
console.log(`Recording ${LOUNGES.length} lounges every minute to ${DB_PATH}`);
