/**
 * Sanitize outbound text for Telegram's legacy `Markdown` parse mode.
 *
 * WORKAROUND: The @chat-adapter/telegram adapter hardcodes parse_mode=Markdown
 * (legacy) but its converter emits CommonMark. Messages with `**bold**`, odd
 * delimiter counts, or malformed links are rejected by Telegram and dropped
 * after retries. Remove this once upstream ships real mode-aware conversion
 * (vercel/chat PR #367 adds the knob; a follow-up is needed for the converter).
 *
 * This file is skill-managed (copied verbatim from upstream/channels by
 * /add-telegram) — a bare re-run of /add-telegram or /update-skills
 * overwrites it. The bare-URL wrapping below (2026-07-21, "can't find end
 * of a URL" — GitLab's /-/merge_requests/ underscore) is NOT yet upstream;
 * PR pending at lizo-ai/nanoclaw:fix/telegram-url-underscore-parity →
 * nanocoai/nanoclaw:channels. If this comment is gone after a skill re-run,
 * the fix was reverted — check that PR's status and reapply if unmerged.
 */

const CODE_PATTERN = /```[\s\S]*?```|`[^`\n]*`/g;
const PLACEHOLDER_PREFIX = '\x00CODE';
const PLACEHOLDER_SUFFIX = '\x00';

export function sanitizeTelegramLegacyMarkdown(input: string): string {
  if (!input) return input;

  const codeSegments: string[] = [];
  let text = input.replace(CODE_PATTERN, (m) => {
    codeSegments.push(m);
    return `${PLACEHOLDER_PREFIX}${codeSegments.length - 1}${PLACEHOLDER_SUFFIX}`;
  });

  // Existing markdown links (e.g. `[docs](https://example.com/a_b)`) hide
  // their URL from the bare-URL wrap below and get placeholder-protected
  // here first, so an underscore in the link *destination* survives the
  // delimiter-parity stripping a few lines down same as a code span would.
  const LINK_PATTERN = /\[[^[\]\n]*\]\([^()\n]*\)/g;
  text = text.replace(LINK_PATTERN, (m) => {
    codeSegments.push(m);
    return `${PLACEHOLDER_PREFIX}${codeSegments.length - 1}${PLACEHOLDER_SUFFIX}`;
  });

  // Bare URLs (not already in a markdown link or code span, both already
  // placeholder-protected above) commonly contain underscores — GitLab's
  // /-/merge_requests/ path is the recurring offender. The delimiter-parity
  // check below can't tell a URL's underscore from a real _italic_ marker,
  // and Telegram's own legacy-Markdown parser chokes on an unescaped `_`
  // inside a bare URL ("can't find end of a URL"), silently dropping the
  // message after retries exhaust. Wrapping in `[url](url)` moves the
  // underscore into the link *destination*, which Telegram does not
  // re-parse for entities — keeps the link clickable, unlike backticks.
  // Protected via the same placeholder mechanism as code spans (not inlined
  // directly) so the parity/bracket checks below can't see or strip its `_`
  // or `[`/`]` — those checks run on raw regex counts, not real parse state.
  text = text.replace(/\bhttps?:\/\/[^\s<>\])]+/g, (m) => {
    codeSegments.push(`[${m}](${m})`);
    return `${PLACEHOLDER_PREFIX}${codeSegments.length - 1}${PLACEHOLDER_SUFFIX}`;
  });

  // The adapter re-parses and re-stringifies markdown before sending, which
  // rewrites `- item` list bullets into `* item` — injecting unbalanced
  // asterisks that Telegram's legacy Markdown parser then rejects. Replace
  // list bullets with a plain Unicode bullet so the adapter treats the line
  // as prose.
  text = text.replace(/^(\s*)[-+]\s+/gm, '$1• ');

  // Flatten Markdown horizontal rules (bare --- / *** / ___ lines) to a
  // plain Unicode divider. The parser doesn't understand HR syntax and the
  // `*` / `_` characters would otherwise unbalance the delimiter counts below.
  text = text.replace(/^[ \t]*[-_*]{3,}[ \t]*$/gm, '⎯⎯⎯');

  text = text.replace(/\*\*([^*\n]+?)\*\*/g, '*$1*');
  text = text.replace(/__([^_\n]+?)__/g, '_$1_');

  const starCount = (text.match(/\*/g) ?? []).length;
  const underCount = (text.match(/_/g) ?? []).length;
  if (starCount % 2 !== 0 || underCount % 2 !== 0) {
    text = text.replace(/[*_]/g, '');
  }

  const openBrackets = (text.match(/\[/g) ?? []).length;
  const closeBrackets = (text.match(/\]/g) ?? []).length;
  if (openBrackets !== closeBrackets) {
    text = text.replace(/[[\]]/g, '');
  }

  return text.replace(
    new RegExp(`${PLACEHOLDER_PREFIX}(\\d+)${PLACEHOLDER_SUFFIX}`, 'g'),
    (_, i) => codeSegments[Number(i)],
  );
}
