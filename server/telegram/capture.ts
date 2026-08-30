import { SchedulingError, assertSchedule, type SchedulePrecision } from "../../src/domain/scheduling";

const monthNames = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

const weekdayNames = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
];

const addDays = (localDate: string, days: number): string => {
  const [year, month, day] = localDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
};

const weekdayIndex = (name: string): number => weekdayNames.indexOf(name.toLowerCase());

const nextWeekday = (today: string, targetWeekday: number): string => {
  const [y, m, d] = today.split("-").map(Number);
  const todayDate = new Date(Date.UTC(y, m - 1, d));
  const todayWeekday = todayDate.getUTCDay(); // 0=Sunday
  let delta = (targetWeekday - todayWeekday + 7) % 7;
  if (delta === 0) delta = 7; // next occurrence, not today
  return addDays(today, delta);
};

export interface ParsedCapture {
  title: string;
  schedulePrecision: SchedulePrecision;
  scheduledFor: string;
  scheduledTime?: string;
  estimatedMinutes?: number;
  tags?: string[];
  defaultedToToday: boolean;
}

export const parseTelegramCapture = (text: string, today: string): ParsedCapture => {
  let title = text.trim();
  let schedulePrecision: SchedulePrecision = "day";
  let scheduledFor = today;
  let scheduledTime: string | undefined;
  let estimatedMinutes: number | undefined;
  let tags: string[] | undefined;
  let defaultedToToday = true;

  // ---- Tags (trailing #tag tokens) ----
  const tagsMatch = title.match(/(?:\s+#[A-Za-z0-9_-]{1,64})+$/);
  if (tagsMatch) {
    const raw = tagsMatch[0];
    const found = raw.match(/#[A-Za-z0-9_-]{1,64}/g) ?? [];
    tags = [...new Set(found.map((t) => t.slice(1).trim()).filter(Boolean))];
    title = title.slice(0, tagsMatch.index).trim();
  }

  // ---- Duration (trailing 20m, 45 min, 2h, 1h 30m etc) ----
  // One or more duration tokens at end, e.g. "20m", "45 min", "2h", "1h 30m"
  const durationMatch = title.match(/(?:\s+\d+\s*(?:h|hours?|m|min|mins|minutes)\b)+$/i);
  if (durationMatch) {
    const raw = durationMatch[0];
    const tokens = raw.match(/\d+\s*(?:h|hours?|m|min|mins|minutes)\b/gi) ?? [];
    let total = 0;
    for (const tok of tokens) {
      const num = Number(tok.match(/\d+/)![0]);
      if (/h/i.test(tok)) total += num * 60;
      else total += num;
    }
    if (total > 0) {
      estimatedMinutes = Math.min(1440, Math.max(1, total));
      title = title.slice(0, durationMatch.index).trim();
    }
  }

  // ---- Time (trailing at HH:MM or HH:MM) ----
  const timeMatch = title.match(/(?:\s+at)?\s+([01]\d|2[0-3]):([0-5]\d)$/);
  if (timeMatch) {
    const hh = timeMatch[1];
    const mm = timeMatch[2];
    scheduledTime = `${hh}:${mm}`;
    title = title.slice(0, timeMatch.index).trim();
  }

  // ---- Date ----
  const explicitDay = title.match(/(?:\s+|^)(\d{4}-\d{2}-\d{2})$/);
  if (explicitDay) {
    scheduledFor = explicitDay[1];
    title = title.slice(0, explicitDay.index).trim();
    defaultedToToday = false;
  } else if (/\s+today$/i.test(title)) {
    scheduledFor = today;
    title = title.replace(/\s+today$/i, "").trim();
    defaultedToToday = false;
  } else if (/\s+tomorrow$/i.test(title)) {
    scheduledFor = addDays(today, 1);
    title = title.replace(/\s+tomorrow$/i, "").trim();
    defaultedToToday = false;
  } else {
    // Weekday: next Friday / Friday / monday etc
    const weekdayMatch = title.match(/\s+(?:next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/i);
    if (weekdayMatch) {
      const idx = weekdayIndex(weekdayMatch[1]);
      if (idx >= 0) {
        scheduledFor = nextWeekday(today, idx);
        title = title.slice(0, weekdayMatch.index).trim();
        defaultedToToday = false;
      }
    } else {
      // Month: in September [year]  OR  September [year] (bare)
      const monthWithIn = title.match(/\s+in\s+([a-z]+)(?:\s+(\d{4}))?$/i);
      const monthBare = title.match(/\s+([a-z]+)(?:\s+(\d{4}))?$/i);
      let monthMatch: RegExpMatchArray | null = null;
      let isBare = false;
      if (monthWithIn) {
        const idx = monthNames.indexOf(monthWithIn[1].toLowerCase());
        if (idx >= 0) monthMatch = monthWithIn;
      } else if (monthBare) {
        const candidate = monthBare[1].toLowerCase();
        const idx = monthNames.indexOf(candidate);
        // Only treat bare month as month if it's a full month name and not a weekday and not already handled
        // Avoid false positives like "May" as verb: require at least 3 chars and is month name
        if (idx >= 0) {
          // Ensure bare month is not part of a larger word and is at end
          // We already matched at end, so accept
          monthMatch = monthBare;
          isBare = true;
        }
      }
      if (monthMatch) {
        const monthIndex = monthNames.indexOf(monthMatch[1].toLowerCase());
        if (monthIndex >= 0) {
          const currentYear = Number(today.slice(0, 4));
          let year = monthMatch[2] ? Number(monthMatch[2]) : currentYear;
          const candidate = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
          if (!monthMatch[2] && candidate <= today.slice(0, 7)) year += 1;
          schedulePrecision = "month";
          scheduledFor = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
          // For bare month, we need to ensure we slice correctly: monthMatch.index is where the match starts
          // For "in <month>", index includes " in", for bare it includes " <month>"
          title = title.slice(0, monthMatch.index).trim();
          defaultedToToday = false;
          // Month precision must not have time
          if (scheduledTime) {
            throw new SchedulingError("invalid_time", "A time can only be set for an exact day.");
          }
        }
      }
    }
  }

  // If month precision, time must be null (already checked), and estimatedMinutes/tags are okay
  if (!title) throw new SchedulingError("invalid_title", "Send an actionable task title.");
  assertSchedule(schedulePrecision, scheduledFor, today, scheduledTime);
  const result: ParsedCapture = { title, schedulePrecision, scheduledFor, defaultedToToday };
  if (scheduledTime) result.scheduledTime = scheduledTime;
  if (estimatedMinutes !== undefined) result.estimatedMinutes = estimatedMinutes;
  if (tags && tags.length) result.tags = tags;
  return result;
};

export { addDays };
