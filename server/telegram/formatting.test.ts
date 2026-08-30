import { describe, expect, it } from "vitest";
import { pendingSchedulePrompt, formatAdded, formatToday, formatCurrent } from "./formatting";
import type { ScheduledTask } from "../../src/domain/scheduling";

describe("telegram formatting", () => {
  it("escapes title in pending prompt and builds 4-button keyboard", () => {
    const { text, keyboard } = pendingSchedulePrompt("Buy & <paper>", "abc-123");
    expect(text).toBe("Buy &amp; &lt;paper&gt;\n\nWhen?");
    const inline = (keyboard.inline_keyboard as unknown[][]).flat();
    expect(inline).toHaveLength(4);
    expect((keyboard.inline_keyboard as unknown as { text: string; callback_data: string }[][])[0][0].callback_data).toBe("sch:today:abc-123");
    expect((keyboard.inline_keyboard as unknown as { text: string; callback_data: string }[][])[0][1].callback_data).toBe("sch:tomorrow:abc-123");
  });

  it("formats added with date label and escapes", () => {
    expect(formatAdded("Test <b>", "2026-09-14")).toBe("<b>Added:</b> Test &lt;b&gt;\nScheduled for 2026-09-14.");
    expect(formatAdded("Month task", "month 2026-09")).toBe("<b>Added:</b> Month task\nScheduled for month 2026-09.");
  });

  it("formats Today as compact read-only with arrow and open count", () => {
    const tasks: ScheduledTask[] = [
      { id: "1", userId: "u", title: "A", notes: "", tags: [], schedulePrecision: "day", scheduledFor: "2026-08-30", plannedOrder: 0, status: "open", isFrog: true, frogFailures: 0, beforeFrog: false, source: "manual", createdAt: "", updatedAt: "", version: 1 },
      { id: "2", userId: "u", title: "B", notes: "", tags: [], schedulePrecision: "day", scheduledFor: "2026-08-30", plannedOrder: 1, status: "open", isFrog: false, frogFailures: 0, beforeFrog: false, source: "manual", createdAt: "", updatedAt: "", version: 1 },
    ];
    const { text, keyboard } = formatToday(tasks, { APP_ORIGIN: "https://example.com" } as never);
    expect(text).toContain("<b>TODAY</b>");
    expect(text).toContain("→ 🐸 A");
    expect(text).toContain("  B");
    expect(text).toContain("2 open");
    expect(keyboard?.inline_keyboard).toBeDefined();
  });

  it("formats Current with frog and remaining and keyboard", () => {
    const task: ScheduledTask = {
      id: "1", userId: "u", title: "Focus <task>", notes: "note", tags: [], schedulePrecision: "day", scheduledFor: "2026-08-30", plannedOrder: 0, status: "open", isFrog: true, frogFailures: 0, beforeFrog: false, source: "manual", createdAt: "", updatedAt: "", version: 1,
    };
    const { text, keyboard } = formatCurrent(task, 3, { APP_ORIGIN: "https://example.com" } as never);
    expect(text).toContain("<b>CURRENT</b>");
    expect(text).toContain("🐸 Focus &lt;task&gt;");
    expect(text).toContain("3 remaining today.");
    expect((keyboard?.inline_keyboard as unknown[][]).length).toBe(2);
  });

  it("returns empty Today when no tasks", () => {
    const { text } = formatToday([], { APP_ORIGIN: "https://example.com" } as never);
    expect(text).toBe("Nothing is scheduled for today.");
  });
});
