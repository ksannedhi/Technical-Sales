/**
 * parseClaudeJSON — shared Claude response parser used by all server modules.
 *
 * Tries four formats in order:
 *   1. <r>...</r>          — primary wrapping tag used in all prompts
 *   2. <result>...</result> — legacy fallback tag
 *   3. ```json ... ```     — markdown code fence
 *   4. bare JSON object    — last-resort direct parse
 *   5. partial <r> content — truncation recovery for roadmap responses
 *
 * Throws if no parseable JSON is found.
 */
export function parseClaudeJSON(text) {
  // Try <r>...</r> first (primary format)
  let match = text.match(/<r>([\s\S]*?)<\/r>/);
  if (match) return JSON.parse(match[1].trim());

  // Fallback 1: <result>...</result>
  match = text.match(/<result>([\s\S]*?)<\/result>/);
  if (match) return JSON.parse(match[1].trim());

  // Fallback 2: markdown code fence ```json ... ```
  match = text.match(/```json\s*([\s\S]*?)```/);
  if (match) return JSON.parse(match[1].trim());

  // Fallback 3: bare JSON object (complete)
  const jsonStart = text.indexOf('{');
  if (jsonStart !== -1) {
    const snippet = text.slice(jsonStart);
    try { return JSON.parse(snippet); } catch { /* fall through to truncation recovery */ }
  }

  // Fallback 4: partial JSON after <r> tag (response was truncated before </r>)
  // Truncation typically happens mid-string — try to recover usable roadmap items
  const openTag = text.indexOf('<r>');
  if (openTag !== -1) {
    const partial = text.slice(openTag + 3).trim();
    // For roadmap: extract roadmapItems array even if executiveSummary is cut off
    const itemsMatch = partial.match(/"roadmapItems"\s*:\s*(\[[\s\S]*)/);
    if (itemsMatch) {
      const arrayText = itemsMatch[1];
      // Find the last complete object — close after the last }
      const lastClose = arrayText.lastIndexOf('}');
      if (lastClose !== -1) {
        try {
          const safeArray = JSON.parse(arrayText.slice(0, lastClose + 1) + ']');
          console.warn('[parseClaudeJSON] Recovered partial roadmap — response was truncated. Increase max_tokens.');
          return { roadmapItems: safeArray, executiveSummary: 'Analysis truncated — please re-run to get the full summary.', totalGaps: safeArray.length, criticalGaps: 0 };
        } catch { /* fall through */ }
      }
    }
  }

  // Log the actual response for debugging
  const preview = text.length > 500 ? text.slice(0, 500) + '…[truncated]' : text;
  console.error('[parseClaudeJSON] Failed to parse. Raw response:', preview);
  throw new Error('No parseable JSON found in Claude response');
}
