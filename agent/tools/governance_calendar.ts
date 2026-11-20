import { defineTool } from "eve/tools";
import { z } from "zod";

const TIME_ZONE = "America/Chicago";
const DAY_MS = 24 * 60 * 60 * 1000;

type Milestone = {
  id: string;
  title: string;
  date: string;
  kind: "statutory" | "governance";
  authority: string;
  note: string;
};

const MILESTONES: Milestone[] = [
  {
    id: "fincen-boi",
    title: "FinCEN Beneficial Ownership Information (BOI) submission",
    date: "2026-11-06",
    kind: "statutory",
    authority: "FinCEN (federal)",
    note: "Finalized submission deadline target. Confirm current FinCEN applicability and the filing receipt.",
  },
  {
    id: "term-conclusion",
    title: "9-month leadership term conclusion",
    date: "2027-05-21",
    kind: "governance",
    authority: "Internal (Rotation Ledger Engine)",
    note: "Triggers scheduled Sentinel transition protocols and portal access re-scoping.",
  },
  {
    id: "kansas-biennial",
    title: "Kansas biennial information report window",
    date: "2028-04-15",
    kind: "statutory",
    authority: "Kansas Secretary of State (BESS)",
    note: "Maintain Good Standing via BESS verification ahead of the reporting window.",
  },
];

function chicagoParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
    timeZoneName: "short",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")) % 24,
    minute: Number(get("minute")),
    weekday: get("weekday"),
    zone: get("timeZoneName"),
  };
}

function chicagoWallTimeToUtc(year: number, month: number, day: number, hour: number) {
  const guess = new Date(Date.UTC(year, month - 1, day, hour));
  const seen = chicagoParts(guess);
  const seenAsUtc = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute);
  return new Date(guess.getTime() - (seenAsUtc - guess.getTime()));
}

function formatChicago(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    dateStyle: "full",
    timeStyle: "short",
  }).format(date) + ` ${chicagoParts(date).zone}`;
}

function nextWeeklyReview(now: Date) {
  const today = chicagoParts(now);
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dow = weekdays.indexOf(today.weekday);
  for (let offset = 0; offset <= 7; offset++) {
    if ((dow + offset) % 7 !== 1) continue;
    const base = new Date(Date.UTC(today.year, today.month - 1, today.day + offset));
    const review = chicagoWallTimeToUtc(
      base.getUTCFullYear(),
      base.getUTCMonth() + 1,
      base.getUTCDate(),
      8,
    );
    if (review.getTime() > now.getTime()) return review;
  }
  const base = new Date(Date.UTC(today.year, today.month - 1, today.day + 7));
  return chicagoWallTimeToUtc(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), 8);
}

export default defineTool({
  description:
    "Live status of Integrated Avodah LLC statutory deadlines and governance milestones (FinCEN BOI, Kansas biennial report, 9-month leadership term end) plus the next Model A Council weekly review (Mondays 8:00 AM Central). Use for any question about deadlines, days remaining, overdue items, or upcoming governance dates.",
  inputSchema: z.object({
    asOf: z
      .string()
      .optional()
      .describe("Optional ISO date or datetime to evaluate against. Defaults to now."),
  }),
  async execute({ asOf }) {
    const now = asOf ? new Date(asOf) : new Date();
    if (Number.isNaN(now.getTime())) {
      throw new Error(`Invalid asOf value "${asOf}". Use an ISO date like 2026-11-20.`);
    }

    const today = chicagoParts(now);
    const todayUtc = Date.UTC(today.year, today.month - 1, today.day);

    const milestones = MILESTONES.map((m) => {
      const [y, mo, d] = m.date.split("-").map(Number);
      const daysRemaining = Math.round((Date.UTC(y, mo - 1, d) - todayUtc) / DAY_MS);
      const status =
        daysRemaining < 0 ? "past_due" : daysRemaining === 0 ? "due_today" : daysRemaining <= 30 ? "due_soon" : "scheduled";
      return { ...m, daysRemaining, status };
    }).sort((a, b) => a.date.localeCompare(b.date));

    const review = nextWeeklyReview(now);

    return {
      evaluatedAt: formatChicago(now),
      timeZone: TIME_ZONE,
      nextWeeklyReview: {
        title: "Model A Council weekly governance review",
        at: formatChicago(review),
        isoUtc: review.toISOString(),
      },
      milestones,
      pastDue: milestones.filter((m) => m.status === "past_due").map((m) => m.id),
    };
  },
});
