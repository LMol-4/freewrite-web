/**
 * `js/renderer.js:46-56`, verbatim — typos included. These are tuned text,
 * not code; "correcting" them changes the model's output.
 */
export const CHATGPT_PROMPT = `below is my journal entry. wyt? talk through it with me like a friend. don't therpaize me and give me a whole breakdown, don't repeat my thoughts with headings. really take all of this, and tell me back stuff truly as if you're an old homie.

Keep it casual, dont say yo, help me make new connections i don't see, comfort, validate, challenge, all of it. dont be afraid to say a lot. format with markdown headings if needed.

do not just go through every single thing i say, and say it back to me. you need to proccess everythikng is say, make connections i don't see it, and deliver it all back to me as a story that makes me feel what you think i wanna feel. thats what the best therapists do.

ideally, you're style/tone should sound like the user themselves. it's as if the user is hearing their own tone but it should still feel different, because you have different things to say and don't just repeat back they say.

else, start by saying, "hey, thanks for showing me this. my thoughts:"

my entry:`;

/** `js/renderer.js:58-66`, verbatim. */
export const CLAUDE_PROMPT = `Take a look at my journal entry below. I'd like you to analyze it and respond with deep insight that feels personal, not clinical.
Imagine you're not just a friend, but a mentor who truly gets both my tech background and my psychological patterns. I want you to uncover the deeper meaning and emotional undercurrents behind my scattered thoughts.
Keep it casual, dont say yo, help me make new connections i don't see, comfort, validate, challenge, all of it. dont be afraid to say a lot. format with markdown headings if needed.
Use vivid metaphors and powerful imagery to help me see what I'm really building. Organize your thoughts with meaningful headings that create a narrative journey through my ideas.
Don't just validate my thoughts - reframe them in a way that shows me what I'm really seeking beneath the surface. Go beyond the product concepts to the emotional core of what I'm trying to solve.
Be willing to be profound and philosophical without sounding like you're giving therapy. I want someone who can see the patterns I can't see myself and articulate them in a way that feels like an epiphany.
Start with 'hey, thanks for showing me this. my thoughts:' and then use markdown headings to structure your response.

Here's my journal entry:`;

/** A3: the gate, verbatim message (`js/renderer.js:578-579`). */
export const CHAT_MIN_LENGTH = 350;
export const CHAT_TOO_SHORT_MESSAGE =
  "Please free write for at minimum 5 minutes first. Then click this. Trust.";

/** §10: a conservative ceiling past which the URL goes through the clipboard instead. */
export const CHAT_URL_LENGTH_LIMIT = 8000;

export type ChatDestination = "chatgpt" | "claude";

const DESTINATIONS: Record<ChatDestination, { prompt: string; base: string; bareUrl: string }> = {
  chatgpt: {
    prompt: CHATGPT_PROMPT,
    base: "https://chat.openai.com/?m=",
    bareUrl: "https://chat.openai.com/",
  },
  claude: {
    prompt: CLAUDE_PROMPT,
    base: "https://claude.ai/new?q=",
    bareUrl: "https://claude.ai/new",
  },
};

/** A3: gate on the *trimmed* entry length. */
export function isChatEligible(entry: string): boolean {
  return entry.trim().length >= CHAT_MIN_LENGTH;
}

export interface ChatDispatch {
  /** Prompt + trimmed entry — what gets copied to the clipboard in the fallback branch. */
  body: string;
  /** Full URL with the encoded body. Only safe to open when short enough. */
  url: string;
  /** The destination with no query string, opened when the body must go via clipboard instead. */
  bareUrl: string;
  /** True once `url` exceeds `CHAT_URL_LENGTH_LIMIT` and the clipboard fallback must be used. */
  requiresClipboardFallback: boolean;
}

/**
 * §10: `body = prompt + "\n\n" + entry.trim()`, matching `js/renderer.js:663`
 * and `:674` which both send `editor.value.trim()`. The prompt itself is not
 * trimmed.
 */
export function buildChatDispatch(destination: ChatDestination, entry: string): ChatDispatch {
  const { prompt, base, bareUrl } = DESTINATIONS[destination];
  const body = prompt + "\n\n" + entry.trim();
  const url = base + encodeURIComponent(body);
  return {
    body,
    url,
    bareUrl,
    requiresClipboardFallback: url.length > CHAT_URL_LENGTH_LIMIT,
  };
}
