import { SchedulingError, assertSchedule, type SchedulePrecision } from "../../src/domain/scheduling";

const monthNames = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december"
];

const addDays = (localDate: string, days: number): string => {
  const [year, month, day] = localDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
};

export interface ParsedCapture {
  title: string;
  schedulePrecision: SchedulePrecision;
  scheduledFor: string;
  defaultedToToday: boolean;
}

export const parseTelegramCapture = (text: string, today: string): ParsedCapture => {
  let title = text.trim();
  let schedulePrecision: SchedulePrecision = "day";
  let scheduledFor = today;
  let defaultedToToday = true;

  const explicitDay = title.match(/(?:\s+|^)(\d{4}-\d{2}-\d{2})$/);
  if (explicitDay) {
    scheduledFor = explicitDay[1];
    title = title.slice(0, explicitDay.index).trim();
    defaultedToToday = false;
  } else if (/\s+tomorrow$/i.test(title)) {
    scheduledFor = addDays(today, 1);
    title = title.replace(/\s+tomorrow$/i, "").trim();
    defaultedToToday = false;
  } else {
    const month = title.match(/\s+in\s+([a-z]+)(?:\s+(\d{4}))?$/i);
    if (month) {
      const monthIndex = monthNames.indexOf(month[1].toLowerCase());
      if (monthIndex >= 0) {
        const currentYear = Number(today.slice(0, 4));
        let year = month[2] ? Number(month[2]) : currentYear;
        const candidate = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
        if (!month[2] && candidate <= today.slice(0, 7)) year += 1;
        schedulePrecision = "month";
        scheduledFor = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
        title = title.slice(0, month.index).trim();
        defaultedToToday = false;
      }
    }
  }

  if (!title) throw new SchedulingError("invalid_title", "Send an actionable task title.");
  assertSchedule(schedulePrecision, scheduledFor, today);
  return { title, schedulePrecision, scheduledFor, defaultedToToday };
};
