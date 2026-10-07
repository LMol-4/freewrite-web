import { describe, expect, it } from "vitest";
import {
  CHATGPT_PROMPT,
  CLAUDE_PROMPT,
  CHAT_MIN_LENGTH,
  CHAT_URL_LENGTH_LIMIT,
  isChatEligible,
  buildChatDispatch,
} from "./prompts";

describe("prompts", () => {
  it("are verbatim, typos included", () => {
    expect(CHATGPT_PROMPT).toContain("don't therpaize me");
    expect(CHATGPT_PROMPT).toContain("proccess everythikng is say");
    expect(CHATGPT_PROMPT.trim().endsWith("my entry:")).toBe(true);
    expect(CLAUDE_PROMPT).toContain("Here's my journal entry:");
  });
});

describe("isChatEligible", () => {
  it("blocks entries under 350 trimmed characters", () => {
    expect(isChatEligible("a".repeat(CHAT_MIN_LENGTH - 1))).toBe(false);
  });

  it("allows entries at exactly 350 trimmed characters", () => {
    expect(isChatEligible("a".repeat(CHAT_MIN_LENGTH))).toBe(true);
  });

  it("gates on the trimmed length, ignoring surrounding whitespace", () => {
    const padded = "  " + "a".repeat(CHAT_MIN_LENGTH - 1) + "  ";
    expect(isChatEligible(padded)).toBe(false);
  });
});

describe("buildChatDispatch", () => {
  it("builds a chatgpt url with the prompt and trimmed entry", () => {
    const dispatch = buildChatDispatch("chatgpt", "  hello world  ");
    expect(dispatch.body).toBe(CHATGPT_PROMPT + "\n\nhello world");
    expect(dispatch.url).toBe(
      "https://chat.openai.com/?m=" + encodeURIComponent(dispatch.body),
    );
    expect(dispatch.requiresClipboardFallback).toBe(false);
  });

  it("builds a claude url with the prompt and trimmed entry", () => {
    const dispatch = buildChatDispatch("claude", "hello world");
    expect(dispatch.body).toBe(CLAUDE_PROMPT + "\n\nhello world");
    expect(dispatch.url).toBe(
      "https://claude.ai/new?q=" + encodeURIComponent(dispatch.body),
    );
  });

  it("flags the clipboard fallback once the encoded url passes the limit", () => {
    const longEntry = "x".repeat(CHAT_URL_LENGTH_LIMIT * 2);
    const dispatch = buildChatDispatch("chatgpt", longEntry);
    expect(dispatch.requiresClipboardFallback).toBe(true);
    expect(dispatch.bareUrl).toBe("https://chat.openai.com/");
  });

  it("claude's bare url has no trailing slash, matching the app route", () => {
    const longEntry = "x".repeat(CHAT_URL_LENGTH_LIMIT * 2);
    const dispatch = buildChatDispatch("claude", longEntry);
    expect(dispatch.bareUrl).toBe("https://claude.ai/new");
  });
});
