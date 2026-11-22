# WaitWell API learnings

Shared scratchpad for agents working on this repo. Add what you learn about how WaitWell's API behaves; don't re-discover it.

## Basics

- OAK Escape Lounge = WaitWell site `409810`, queue `10` (`https://409810.waitwell.us/join/10`).
- Call the API host `https://api.waitwell.us/api/409810/…`. The `409810.waitwell.us` website sits behind a Cloudflare challenge that blocks curl/fetch; the API host doesn't.
- Other lounges use the same API, headers, and responses under their own site ID (`https://api.waitwell.us/api/<siteId>/…`). A site ID is a 4-digit company number + 2-digit location number (CAVU US `4098xx`, CAVU UK `4194xx`, CAVU AU `4232xx`, Plaza Premium Orlando `432501`). The full scan is in [this thread](https://ampcode.com/threads/T-01a1ff5e-c6be-7773-af02-492189a77196).
- A site's queue IDs are in `client/state` → `data.Queues[].id`. They don't always match the location number (GSP `409808` is queue 26). Every lounge site has exactly one queue. `lib/lounges.ts` lists them all.
- Shell IDs: any location number 01–99 under a real company returns success; only ones whose `client/state` has a `Location` are real sites.
- `Location.TimeZone` is mostly right, but SJU says `America/Chicago`.
- No public OpenAPI spec (`/swagger.json`, `/openapi.json`, `/api-docs`, `/docs` all 404). The web app is an Angular/Ionic SPA; endpoints were found by reading its JS bundles (grep for `"client/`).

## Required headers

- Browser `User-Agent`, `x-appname: Client 3.3.12`, and `x-apptoken` (any ms timestamp + 3 digits works). Missing any → 429 or a 200 with `success:false, code:45206`.
- `Client 3.3.12` is the web app version and may need updating if WaitWell ships a new build.

## Responses

- Errors usually come back as **HTTP 200 with `success:false`**. Always check `success` (it can be `true` or `1`).
- A 429 often means bad headers, not rate limiting. Still, space out test requests.

## Endpoints

| Action | Call |
| --- | --- |
| Queue length / wait | `GET client/locationstatus?Queue_id=10` → `NumberWaiting`, `CurrentWaitTime` (min) |
| Session + form config | `GET client/state` → sets cookies, `data.Location.key`, custom field defs in `data.Settings` |
| Entry types | `GET client/servicetypes?Queue_id=10&IncludeUrlRedirect=1` |
| Join | `POST client/ticket` (JSON) → `data.token` is the ticket link |
| Ticket status | `GET client/status/{ticketLink}` |
| Leave queue | `POST client/cancel/{ticketLink}` with `{}` |
| Need more time | `GET client/status/{ticketLink}?needmoretime=1` (not yet tested) |
| Reply to lounge | `POST client/reply` `{message, TicketLink}` (not yet tested) |

## Joining (`POST client/ticket`)

- Needs a `FormToken`: the hex of `Location.key` XOR'd char-by-char with one byte, which is the XOR of all chars of the salt `"Client%" + <count of non-undefined fields> + <13 + sum of UTF-8 byte lengths of non-null values>`. It's ported from the web app's `AppState.getSlt`/`encode` (its default salt `_34ZZpACKY9` isn't used for join). See `formToken` in `waitwell.ts`.
- `Location.key` is **different on every `client/state` call** and is bound to that call's cookies (`WW_xsrf`, `AWSALB`, `AWSALBCORS`). Fetch state and post the ticket in the same cookie session.
- Send the exact payload shape the web form sends, with numbers as strings (the web app's salt function stringifies them). Custom fields: `CustomField1` = flight number, `CustomField2` = airline (one of `Alaska, Allegiant, Delta, Hawaiian, Southwest, Spirit, Other.`), `CustomField3` = marketing opt-in `"yes"`/`"no"`. `ServiceType_id` = entry type ("How are you entering the lounge today?").
- Response: `{data:{token, Stage, initialEstWaitTimeMins, initialPosition, id, exists}}`. `exists:true` means it matched an existing ticket.

## Ticket status

- `data.stage`: 1/2 waiting, **3 = serving ("It's your turn")**, 4 completed, 5 no-show, 6 removed, 7 cancelled, 8 invalid… (full enum in `STAGES` in `waitwell.ts`). `invalid:true` = unknown link.
- `estimatedWait` here is **seconds**, while join's `initialEstWaitTimeMins` is minutes.
- `content` is the HTML message thread from the lounge.

## Testing etiquette

- Testing join against the real queue is OK, but **always leave the queue immediately** (`leaveQueue`) and use obviously fake data (`Test Ignore`, `test@example.com`, a reserved `+1 510-555-01xx` number).
- `lujm9pehr` is Harris's real ticket. Don't cancel it.
