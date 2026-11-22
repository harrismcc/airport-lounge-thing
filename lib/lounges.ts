// Every lounge waitlist on WaitWell, found by scanning site IDs (see LEARNINGS.md).
// Each site has one queue, and its ID is not always the site's location number.
// Time zones come from each site's client/state Location.TimeZone.

export interface Lounge {
  siteId: number;
  queueId: number;
  /** IATA code, or null when unknown. */
  airport: string | null;
  name: string;
  timeZone: string;
}

export const OAK: Lounge = { siteId: 409810, queueId: 10, airport: "OAK", name: "Escape Lounge OAK", timeZone: "America/Los_Angeles" };

export const LOUNGES: Lounge[] = [
  // CAVU US (Escape Lounges)
  { siteId: 409804, queueId: 4, airport: "BDL", name: "Escape Lounge BDL", timeZone: "America/New_York" },
  { siteId: 409805, queueId: 5, airport: "CVG", name: "Escape Lounge CVG", timeZone: "America/New_York" },
  { siteId: 409806, queueId: 6, airport: "CMH", name: "Escape Lounge CMH", timeZone: "America/New_York" },
  { siteId: 409807, queueId: 7, airport: "FLL", name: "Escape Lounge FLL", timeZone: "America/New_York" },
  { siteId: 409808, queueId: 26, airport: "GSP", name: "Escape Lounge GSP", timeZone: "America/New_York" },
  { siteId: 409809, queueId: 9, airport: "MSP", name: "Escape Lounge MSP", timeZone: "America/Chicago" },
  OAK,
  { siteId: 409811, queueId: 11, airport: "PBI", name: "Escape Lounge PBI", timeZone: "America/New_York" },
  { siteId: 409812, queueId: 12, airport: "PHX", name: "Escape Lounge PHX T3", timeZone: "America/Phoenix" },
  { siteId: 409813, queueId: 13, airport: "PHX", name: "Escape Lounge PHX T4", timeZone: "America/Phoenix" },
  { siteId: 409814, queueId: 14, airport: "RNO", name: "Escape Lounge RNO", timeZone: "America/Los_Angeles" },
  { siteId: 409815, queueId: 15, airport: "PVD", name: "Escape Lounge PVD", timeZone: "America/New_York" },
  { siteId: 409816, queueId: 16, airport: "SMF", name: "Escape Lounge SMF A", timeZone: "America/Los_Angeles" },
  { siteId: 409817, queueId: 17, airport: "SMF", name: "Escape Lounge SMF B", timeZone: "America/Los_Angeles" },
  { siteId: 409818, queueId: 18, airport: "SYR", name: "Escape Lounge SYR", timeZone: "America/New_York" },
  { siteId: 409825, queueId: 27, airport: "TUL", name: "Escape Lounge TUL", timeZone: "America/Chicago" },
  { siteId: 409826, queueId: 28, airport: "XNA", name: "Escape Lounge XNA", timeZone: "America/Chicago" },
  // WaitWell says America/Chicago, which is wrong for San Juan.
  { siteId: 409827, queueId: 29, airport: "SJU", name: "Escape Lounge SJU", timeZone: "America/Puerto_Rico" },
  { siteId: 409828, queueId: 30, airport: "MCI", name: "Escape Lounge MCI", timeZone: "America/Chicago" },
  { siteId: 409829, queueId: 31, airport: "PDX", name: "Escape Lounge PDX", timeZone: "America/Los_Angeles" },
  // CAVU UK
  { siteId: 419401, queueId: 1, airport: "BRS", name: "Escape Lounge BRS", timeZone: "Europe/London" },
  { siteId: 419402, queueId: 2, airport: "EMA", name: "Escape Lounge EMA", timeZone: "Europe/London" },
  { siteId: 419403, queueId: 3, airport: "MAN", name: "Escape Lounge MAN T1", timeZone: "Europe/London" },
  { siteId: 419404, queueId: 4, airport: "MAN", name: "Escape Lounge MAN T2", timeZone: "Europe/London" },
  { siteId: 419405, queueId: 5, airport: "MAN", name: "Escape Lounge MAN T3", timeZone: "Europe/London" },
  { siteId: 419406, queueId: 6, airport: "STN", name: "Escape Lounge STN", timeZone: "Europe/London" },
  { siteId: 419408, queueId: 9, airport: "EDI", name: "Escape Lounge EDI", timeZone: "Europe/Dublin" },
  { siteId: 419409, queueId: 11, airport: "BRS", name: "Essence Lounge BRS", timeZone: "Europe/London" },
  // WaitWell gives no address for this one.
  { siteId: 419410, queueId: 12, airport: null, name: "The Executive", timeZone: "Europe/London" },
  // CAVU AU
  { siteId: 423201, queueId: 1, airport: "BNE", name: "Escape Lounge BNE", timeZone: "Australia/Brisbane" },
  { siteId: 423202, queueId: 3, airport: "CNS", name: "Escape Lounge CNS", timeZone: "Australia/Brisbane" },
  // Plaza Premium
  { siteId: 432501, queueId: 1, airport: "MCO", name: "Plaza Premium Lounge MCO", timeZone: "America/New_York" },
];
