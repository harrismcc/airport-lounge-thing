// Unofficial SDK for airport lounge waitlists on WaitWell, e.g. OAK's at https://409810.waitwell.us/join/10.
// See LEARNINGS.md for why the API is called this way.

import { OAK, type Lounge } from "./lounges";

// Everything except getQueueStatus is OAK-only for now.
const QUEUE_ID = OAK.queueId;

export const AIRLINES = ["Alaska", "Allegiant", "Delta", "Hawaiian", "Southwest", "Spirit", "Other."] as const;
export type Airline = (typeof AIRLINES)[number];

/** Ticket stages from the web app's enum. */
export const STAGES: Record<number, string> = {
  1: "WAITING1", 2: "WAITING2", 3: "SERVING", 4: "COMPLETED", 5: "NOSHOW", 6: "REMOVED", 7: "CANCELLED",
  8: "INVALID", 9: "BUSINESS_CLOSED", 10: "QUEUE_MAX", 11: "QUEUE_CLOSED", 12: "PENDING_PARTYSIZE",
  13: "REMOVED_CUSTOM", 14: "PENDING_SERVICETYPE", 15: "PENDING_QUEUE", 16: "PENDING_PASSCODE",
  17: "PENDING_PAYMENT", 19: "NO_CONFIRMATION", 20: "PENDING", 21: "WAITING_CONFIRMATION",
};

export class WaitWellError extends Error {
  constructor(public status: number, public body: unknown) {
    super(`WaitWell ${status}: ${JSON.stringify(body)}`);
  }
}

// Cookies from /client/state (WW_xsrf, AWSALB...) tie the Location.key to the session, so join must reuse them.
class Session {
  private cookies = new Map<string, string>();

  constructor(private siteId = OAK.siteId) {}

  async request(path: string, init: { method?: string; body?: unknown } = {}): Promise<any> {
    const res = await fetch(`https://api.waitwell.us/api/${this.siteId}/${path}`, {
      method: init.method ?? "GET",
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36",
        "x-appname": "Client 3.3.12",
        "x-apptoken": `${Date.now()}${Math.floor(Math.random() * 900 + 100)}`,
        "x-bd": "-1",
        "content-type": "application/json",
        cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "),
      },
    });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const i = pair!.indexOf("=");
      this.cookies.set(pair!.slice(0, i), pair!.slice(i + 1));
    }
    const body = await res.json().catch(() => null);
    // Errors often come back as HTTP 200 with success:false.
    if (!body?.success) throw new WaitWellError(res.status, body);
    return body;
  }
}

export interface QueueStatus {
  open: boolean;
  waiting: number;
  waitMinutes: number;
  message: string;
}

export async function getQueueStatus(lounge: Lounge = OAK): Promise<QueueStatus> {
  const s = await new Session(lounge.siteId).request(`client/locationstatus?Queue_id=${lounge.queueId}`);
  return { open: s.IsBusinessOpen, waiting: s.NumberWaiting, waitMinutes: s.CurrentWaitTime, message: s.message };
}

/** The site's raw client/state config: queues, hours, entry types, settings. */
export async function getSiteState(lounge: Lounge = OAK): Promise<any> {
  return (await new Session(lounge.siteId).request("client/state")).data;
}

export async function getQueueLength(): Promise<number> {
  return (await getQueueStatus()).waiting;
}

/** Answers to "How are you entering the lounge today?". */
export async function getEntryTypes(): Promise<{ id: number; name: string }[]> {
  const { rows } = await new Session().request(`client/servicetypes?Queue_id=${QUEUE_ID}&IncludeUrlRedirect=1`);
  return rows.filter((r: any) => r.AllowOnlineJoin).map((r: any) => ({ id: r.id, name: r.Name }));
}

export interface JoinInput {
  firstName: string;
  lastName: string;
  /** Formatted like the web form sends it, e.g. "+1 510-555-0123". */
  phone: string;
  email: string;
  flightNumber: string;
  airline: Airline;
  marketingOptIn: boolean;
  /** 1 to 6. */
  partySize: number;
  /** Entry type id or exact name from getEntryTypes(), e.g. "Priority Pass/Lounge Key". */
  entryType: number | string;
}

export interface JoinResult {
  ticketLink: string;
  statusUrl: string;
  /** Your place in line when you joined. */
  position: number;
  estimatedWaitMinutes: number;
  /** True when WaitWell matched an existing ticket instead of creating one. */
  alreadyExisted: boolean;
}

export async function joinQueue(input: JoinInput): Promise<JoinResult> {
  const session = new Session();
  const { data: state } = await session.request("client/state");
  let entryTypeId = input.entryType;
  if (typeof entryTypeId === "string") {
    const match = (await getEntryTypes()).find((t) => t.name === entryTypeId);
    if (!match) throw new Error(`Unknown entry type "${entryTypeId}"`);
    entryTypeId = match.id;
  }
  // Same keys, order, and string-typed values as the web form sends; the FormToken salt depends on them.
  const ticket: Record<string, string | null> = {
    FirstName: input.firstName,
    LastName: input.lastName,
    PhoneNumber: input.phone,
    Email: input.email,
    Passcode: "",
    Category_id: null,
    ServiceType_id: String(entryTypeId),
    AdditionalServices_id: null,
    MeetMethod: "1",
    ExtraChanges: null,
    CustomField1: input.flightNumber,
    CustomField2: input.airline,
    CustomField3: input.marketingOptIn ? "yes" : "no",
    Queue_id: String(QUEUE_ID),
    PartySize: String(input.partySize),
  };
  ticket.FormToken = formToken(state.Location.key, ticket);
  const { data } = await session.request("client/ticket", { method: "POST", body: ticket });
  const ticketLink = data.token;
  return {
    ticketLink,
    statusUrl: `https://409810.waitwell.us/status/${ticketLink}`,
    position: data.initialPosition,
    estimatedWaitMinutes: data.initialEstWaitTimeMins,
    alreadyExisted: Boolean(data.exists),
  };
}

export interface TicketStatus {
  stage: number;
  stageName: string;
  /** The lounge has called you ("It's your turn"). */
  isMyTurn: boolean;
  /** Still waiting in line. */
  isWaiting: boolean;
  /** Completed, cancelled, removed, or no-show. */
  isFinished: boolean;
  position: number;
  estimatedWaitMinutes: number;
  entryType: string;
  canLeave: boolean;
  /** Messages from the lounge, as HTML. */
  messagesHtml: string;
}

export async function getTicketStatus(ticketLink: string, extraParams = ""): Promise<TicketStatus> {
  const { data: d } = await new Session().request(`client/status/${ticketLink}${extraParams}`);
  if (d.invalid) throw new Error(`Ticket ${ticketLink} not found`);
  return {
    stage: d.stage,
    stageName: STAGES[d.stage] ?? `UNKNOWN_${d.stage}`,
    isMyTurn: d.stage === 3,
    isWaiting: d.stage === 1 || d.stage === 2,
    isFinished: d.stage >= 4 && d.stage < 20,
    position: d.queuePosition,
    estimatedWaitMinutes: Math.round(d.estimatedWait / 60), // seconds here, unlike join's minutes
    entryType: d.ServiceType,
    canLeave: d.allowCancel === 1,
    messagesHtml: d.content,
  };
}

/** The status page's "Leave Queue" button. */
export async function leaveQueue(ticketLink: string): Promise<void> {
  await new Session().request(`client/cancel/${ticketLink}`, { method: "POST", body: {} });
}

/** The status page's "I need more time" button. */
export async function requestMoreTime(ticketLink: string): Promise<TicketStatus> {
  return getTicketStatus(ticketLink, "?needmoretime=1");
}

/** Reply to the lounge from the status page's Messages panel. */
export async function sendMessage(ticketLink: string, message: string): Promise<void> {
  await new Session().request("client/reply", { method: "POST", body: { message, TicketLink: ticketLink } });
}

// Port of the web app's AppState.getSlt + encode: XOR every char of the key with the XOR of the salt's chars, as hex.
function formToken(locationKey: string, payload: Record<string, unknown>): string {
  const skip = new Set(["ValidateOnly", "token", "waivers"]);
  let count = 0;
  let size = 13;
  for (const [k, v] of Object.entries(payload)) {
    if (skip.has(k)) continue;
    if (v !== undefined) count++;
    if (v != null) size += typeof v === "boolean" ? 1 : new Blob([String(v)]).size;
  }
  const xor = [...`Client%${count}${size}`].reduce((a, c) => a ^ c.charCodeAt(0), 0);
  return [...locationKey].map((c) => (c.charCodeAt(0) ^ xor).toString(16).padStart(2, "0")).join("");
}
