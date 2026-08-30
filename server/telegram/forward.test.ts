import { describe, expect, it } from "vitest";
import { extractForwardContext, isForwarded } from "./forward";
import type { TelegramMessage } from "./types";

describe("telegram forward", () => {
  it("detects forwarded via forward_origin", () => {
    const msg: TelegramMessage = {
      message_id: 1,
      chat: { id: 1 },
      text: "Could you send me the revised offer next Wednesday?",
      forward_origin: { type: "user", sender_user: { id: 123 }, date: 123456 } as unknown,
    };
    expect(isForwarded(msg)).toBe(true);
    const ctx = extractForwardContext(msg);
    expect(ctx?.forwardedText).toBe("Could you send me the revised offer next Wednesday?");
    expect(ctx?.forwardOrigin).toBeDefined();
  });

  it("detects forwarded via legacy forward_from", () => {
    const msg: TelegramMessage = {
      message_id: 1,
      chat: { id: 1 },
      text: "Hello",
      forward_from: { id: 999, username: "alice" },
    } as unknown as TelegramMessage;
    expect(isForwarded(msg)).toBe(true);
    expect(extractForwardContext(msg)?.forwardedText).toBe("Hello");
  });

  it("constructs t.me link when username and message_id disclosed", () => {
    const msg: TelegramMessage = {
      message_id: 1,
      chat: { id: 1 },
      text: "Hello",
      forward_origin: {
        type: "channel",
        chat: { id: -100123, username: "mychannel", title: "My Channel" },
        message_id: 42,
        date: 123,
      } as unknown,
    };
    const ctx = extractForwardContext(msg);
    expect(ctx?.tMeLink).toBe("https://t.me/mychannel/42");
  });

  it("does not fabricate link for hidden_user", () => {
    const msg: TelegramMessage = {
      message_id: 1,
      chat: { id: 1 },
      text: "Secret",
      forward_origin: { type: "hidden_user", sender_user_name: "Anonymous", date: 123 } as unknown,
    };
    const ctx = extractForwardContext(msg);
    expect(ctx?.tMeLink).toBeNull();
    expect(ctx?.forwardedText).toBe("Secret");
  });

  it("returns null for non-forwarded", () => {
    const msg: TelegramMessage = { message_id: 1, chat: { id: 1 }, text: "Normal" };
    expect(isForwarded(msg)).toBe(false);
    expect(extractForwardContext(msg)).toBeNull();
  });

  it("uses caption for forwarded media", () => {
    const msg: TelegramMessage = {
      message_id: 1,
      chat: { id: 1 },
      caption: "Caption text",
      forward_origin: { type: "user", date: 123 } as unknown,
    };
    expect(extractForwardContext(msg)?.forwardedText).toBe("Caption text");
  });
});
