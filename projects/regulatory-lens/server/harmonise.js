import fetch from 'node-fetch';
import {
  taxonomy,
  HARMONISE_SYSTEM,
  buildDomainPrompt,
  ROADMAP_SYSTEM,
  buildRoadmapPrompt
} from './prompt.js';

const CLAUDE_MODEL = 'claude-haiku-4-5';
const API_URL = 'https://api.anthropic.com/v1/messages';

function parseClaudeJSON(text) {
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
  // Truncation typically happens mid-string — try to recover usable items
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

// Retryable HTTP status codes — transient Anthropic-side errors
// 429 = rate-limited (retry after backoff); 500/529 = Anthropic server errors
const RETRYABLE_STATUSES = new Set([429, 500, 529]);
const MAX_RETRIES = 4;
const RETRY_BASE_MS  = 2000;  // base for 500/529 (2s, 4s, 8s …)
const RATE_LIMIT_MS  = 15000; // base for 429 (15s, 30s, 60s …) — TPM window is 60s

async function callClaude(system, userMessage, maxTokens = 1500, abortSignal = null) {
  let lastError;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    // Combine per-call timeout with optional caller-supplied abort signal
    const timeoutSignal = AbortSignal.timeout(90_000);
    const signal = abortSignal
      ? AbortSignal.any([timeoutSignal, abortSignal])
      : timeoutSignal;

    const res = await fetch(API_URL, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: userMessage }]
      })
    });

    if (res.ok) {
      const data = await res.json();
      return data.content[0]?.text || '';
    }

    const errText = await res.text();

    if (RETRYABLE_STATUSES.has(res.status) && attempt < MAX_RETRIES) {
      // 429: respect the TPM window — back off longer than other errors
      const base  = res.status === 429 ? RATE_LIMIT_MS : RETRY_BASE_MS;
      const delay = base * Math.pow(2, attempt - 1);
      console.warn(`[Claude] ${res.status} on attempt ${attempt}/${MAX_RETRIES} — retrying in ${Math.round(delay/1000)}s`);
      await new Promise(r => setTimeout(r, delay));
      lastError = new Error(`Claude API ${res.status}: ${errText}`);
      continue;
    }

    // Non-retryable (400, 401, 404) or final attempt — throw immediately
    throw new Error(`Claude API ${res.status}: ${errText}`);
  }

  throw lastError;
}

// ── Domain result cache — keyed by (domainId + sorted framework list) ───────
// Avoids re-calling Claude for domain/framework combinations already computed in this session
const harmonisationCache = new Map();

function cacheKey(domainId, selectedFrameworkIds) {
  return `${domainId}::${[...selectedFrameworkIds].sort().join(',')}`;
}

export function clearHarmonisationCache() {
  harmonisationCache.clear();
}

// ── Get framework control text from taxonomy for a domain ────────────────────
function getFrameworkControlTexts(domain, customFrameworks = {}) {
  const texts = {};
  for (const [fwId, controlIds] of Object.entries(domain.controls)) {
    if (controlIds.length > 0) {
      texts[fwId] = `Control references: ${controlIds.join(', ')}. Apply knowledge of ${fwId} to describe what these controls require for the "${domain.domainLabel}" domain.`;
    } else {
      texts[fwId] = 'No controls mapped for this domain in this framework.';
    }
  }
  // Overlay custom framework control text for this domain
  for (const [fwId, fw] of Object.entries(customFrameworks)) {
    const mapping = fw.domainControlMap?.[domain.domainId];
    if (mapping && mapping.controlText) {
      texts[fwId] = `Control references: ${(mapping.controlIds || []).join(', ') || 'see text'}. ${mapping.controlText}`;
    } else {
      texts[fwId] = 'No controls mapped for this domain in this framework.';
    }
  }
  return texts;
}

// ── Concurrency limiter — max N Claude calls in flight at once ───────────────
async function runWithConcurrency(items, concurrency, fn, abortSignal = null) {
  const results = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      if (abortSignal?.aborted) break;  // stop picking up new work if client disconnected
      const i = index++;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

// ── Run harmonisation for all selected domains with bounded concurrency ───────
export async function runHarmonisation(selectedFrameworkIds, onDomainComplete, customFrameworks = {}, abortSignal = null) {
  const domains = taxonomy.domains;

  let completed = 0;
  const results = [];

  const domainResults = await runWithConcurrency(domains, 2, async (domain) => {
    try {
      // Merge taxonomy domain controls with custom framework overrides
      const domainWithCustom = {
        ...domain,
        controls: {
          ...domain.controls,
          ...Object.fromEntries(
            Object.entries(customFrameworks).map(([fwId, fw]) => [
              fwId,
              fw.domainControlMap?.[domain.domainId]?.controlIds || []
            ])
          )
        }
      };

      const key    = cacheKey(domain.domainId, selectedFrameworkIds);
      let result;

      if (harmonisationCache.has(key)) {
        // Cache hit — no Claude call needed for this domain/framework combination
        result = harmonisationCache.get(key);
      } else {
        const frameworkControlTexts = getFrameworkControlTexts(domainWithCustom, customFrameworks);
        const prompt = buildDomainPrompt(domainWithCustom, selectedFrameworkIds, frameworkControlTexts);
        const raw    = await callClaude(HARMONISE_SYSTEM, prompt, 2000, abortSignal);
        const parsed = parseClaudeJSON(raw);

        result = {
          ...parsed,
          domainId:    domain.domainId,
          domainLabel: domain.domainLabel,
          description: domain.description
        };
        harmonisationCache.set(key, result);
      }

      completed++;
      if (onDomainComplete) onDomainComplete(completed, domains.length, domain.domainLabel);
      return result;
    } catch (e) {
      console.error(`[Harmonise] Domain ${domain.domainId} failed:`, e.message);
      completed++;
      // Return a safe fallback rather than crashing the whole run
      return {
        domainId:    domain.domainId,
        domainLabel: domain.domainLabel,
        error:       e.message,
        coverageByFramework: Object.fromEntries(
          selectedFrameworkIds.map(f => [f, { coverage: 'unknown', specificity: 'not-applicable', keyRequirement: 'Analysis failed' }])
        )
      };
    }
  }, abortSignal);

  for (const r of domainResults) {
    if (r) results.push(r);
  }

  // Sort to match taxonomy order
  results.sort((a, b) => {
    const ai = domains.findIndex(d => d.domainId === a.domainId);
    const bi = domains.findIndex(d => d.domainId === b.domainId);
    return ai - bi;
  });

  return results;
}

// ── Generate roadmap from harmonisation results + posture ────────────────────
export async function generateRoadmap(harmonisationResults, postureMap, selectedFrameworks, frameworkWeights) {
  const prompt = buildRoadmapPrompt(harmonisationResults, postureMap, selectedFrameworks, frameworkWeights);
  // 8192 = max output tokens for claude-haiku-4-5.
  // 6000 was too low for a full 24-domain roadmap (~300 tokens/item = ~7200 tokens)
  // which caused the closing </r> tag to be truncated and JSON parsing to fail.
  const raw = await callClaude(ROADMAP_SYSTEM, prompt, 8192);
  return parseClaudeJSON(raw);
}
