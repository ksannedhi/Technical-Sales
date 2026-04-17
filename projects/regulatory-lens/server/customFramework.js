import fetch    from 'node-fetch';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { taxonomy } from './prompt.js';

const CLAUDE_MODEL = 'claude-haiku-4-5';
const API_URL      = 'https://api.anthropic.com/v1/messages';

// ── In-memory store for custom frameworks (keyed by frameworkId) ─────────────
// Each entry: { frameworkId, name, version, jurisdiction, sector, domainControlMap, rawText }
// domainControlMap: { [domainId]: { controlIds: string[], controlText: string } }
export const customFrameworkStore = {};

function parseClaudeJSON(text) {
  let match = text.match(/<r>([\s\S]*?)<\/r>/);
  if (match) return JSON.parse(match[1].trim());
  match = text.match(/<result>([\s\S]*?)<\/result>/);
  if (match) return JSON.parse(match[1].trim());
  match = text.match(/```json\s*([\s\S]*?)```/);
  if (match) return JSON.parse(match[1].trim());
  const jsonStart = text.indexOf('{');
  if (jsonStart !== -1) {
    try { return JSON.parse(text.slice(jsonStart)); } catch { /* fall through */ }
  }
  throw new Error('No parseable JSON found in Claude response');
}

async function callClaude(system, userMessage, maxTokens = 3000) {
  const res = await fetch(API_URL, {
    method: 'POST',
    signal: AbortSignal.timeout(60_000),
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model:      CLAUDE_MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: userMessage }]
    })
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}`);
  const data = await res.json();
  return data.content[0]?.text || '';
}

// Known built-in frameworks — used to reject duplicate uploads
const BUILTIN_FRAMEWORK_NAMES = [
  'nca-ecc', 'nca ecc', 'essential cybersecurity controls',
  'sama-csf', 'sama csf', 'sama cyber security framework',
  'cbk', 'central bank of kuwait',
  'iso-27001', 'iso 27001', 'iso/iec 27001',
  'nist-csf', 'nist csf', 'nist cybersecurity framework',
  'uae-niaf', 'uae niaf', 'national information assurance framework',
  'pci-dss', 'pci dss', 'payment card industry',
  'iec-62443', 'iec 62443',
  'soc2', 'soc 2', 'soc2 type', 'aicpa soc',
  'pdpl-uae', 'pdpl uae', 'uae pdpl', 'federal decree-law no. 45',
  'pdpl-qat', 'pdpl qatar', 'qatar pdpl', 'qatar law no. 13',
  'qatar-nias', 'qatar nias', 'national information assurance standard', 'niap-nat', 'nias v2'
];

function isBuiltinFramework(name) {
  if (!name) return false;
  const lower = name.toLowerCase();
  return BUILTIN_FRAMEWORK_NAMES.some(known => lower.includes(known));
}

// Pre-computed once at module load — avoids regenerating on every extraction call (~400 tokens saved)
const TAXONOMY_DOMAIN_LIST = taxonomy.domains
  .map(d => `- ${d.domainId}: ${d.domainLabel}`)
  .join('\n');

const EXTRACTION_SYSTEM = `
You are a cybersecurity compliance expert. You receive the full text of a regulatory framework or
cybersecurity standard document. Extract its control structure and map it to a standard domain taxonomy.

Return ONLY valid JSON inside <r> tags. No prose outside the tags.

The taxonomy domains available for mapping are:
${TAXONOMY_DOMAIN_LIST}

Output schema:
{
  "frameworkName": string,
  "version": string,
  "jurisdiction": string[],
  "sector": string[],
  "summary": string,            // 2-3 sentences describing this framework
  "domainMappings": [
    {
      "domainId": string,        // must exactly match one of the taxonomy domain IDs above
      "controlIds": string[],    // control/article IDs from this framework relevant to this domain
      "controlText": string,     // 2-4 sentences summarising what this framework requires in this domain
      "coverage": "full" | "partial" | "not-addressed"
    }
  ]
}

Rules:
- domainId must be an exact match from the taxonomy list above — do not invent new domain IDs
- Include an entry for every taxonomy domain, even if coverage is "not-addressed"
- controlText should be drawn directly from the document, not from general knowledge
- If a control spans multiple domains, include it in all relevant domains
- version: use "Unknown" if not clearly stated in the document
- jurisdiction: derive from document text (country names as strings)
- sector: derive from document scope section, or ["All sectors"] if not specified
`;

export async function ingestCustomFramework(pdfBuffer, overrideName) {
  // 1. Extract text from PDF
  const parsed  = await pdfParse(pdfBuffer);
  const rawText = parsed.text;

  // Truncate to ~12000 chars to stay within token limits while covering most frameworks
  const wasTruncated = rawText.length > 12000;
  const truncated = wasTruncated
    ? rawText.slice(0, 12000) + '\n\n[Document truncated for analysis — first 12,000 characters processed]'
    : rawText;

  // 2. Claude extracts and maps the framework
  const userMsg = `Extract the control structure from this framework document and map it to the taxonomy domains.\n\n${overrideName ? `The user has named this framework: "${overrideName}"\n\n` : ''}=== DOCUMENT TEXT ===\n${truncated}`;
  const raw     = await callClaude(EXTRACTION_SYSTEM, userMsg, 3000);
  const parsed2 = parseClaudeJSON(raw);

  // 3. Reject if the extracted name matches a built-in framework
  const detectedName = overrideName || parsed2.frameworkName || '';
  if (isBuiltinFramework(detectedName)) {
    throw new Error(
      `"${detectedName}" is already built into the harmoniser as a standard framework. ` +
      `Select it from the framework list above instead of uploading it as a custom framework.`
    );
  }

  // 5. Generate a unique ID
  const existingCustomCount = Object.keys(customFrameworkStore)
    .filter(k => k.startsWith('CUSTOM-')).length;
  const frameworkId = `CUSTOM-${String(existingCustomCount + 1).padStart(3, '0')}`;

  // 6. Build domain control map for harmonisation
  const domainControlMap = {};
  for (const mapping of parsed2.domainMappings || []) {
    domainControlMap[mapping.domainId] = {
      controlIds:  mapping.controlIds  || [],
      controlText: mapping.controlText || '',
      coverage:    mapping.coverage    || 'not-addressed'
    };
  }

  // 7. Store
  const entry = {
    frameworkId,
    name:           overrideName || parsed2.frameworkName || 'Custom Framework',
    version:        parsed2.version      || 'Unknown',
    jurisdiction:   parsed2.jurisdiction || [],
    sector:         parsed2.sector       || ['All sectors'],
    summary:        parsed2.summary      || '',
    domainControlMap,
    mandatory:      false,
    confidenceLevel:'custom',
    uploadedAt:     new Date().toISOString(),
    truncated:      wasTruncated,
    rawTextLength:  rawText.length
  };

  customFrameworkStore[frameworkId] = entry;
  return entry;
}

export function getCustomFrameworkSummaries() {
  return Object.values(customFrameworkStore).map(f => ({
    frameworkId:  f.frameworkId,
    name:         f.name,
    version:      f.version,
    jurisdiction: f.jurisdiction,
    sector:       f.sector,
    summary:      f.summary,
    uploadedAt:   f.uploadedAt
  }));
}

export function deleteCustomFramework(frameworkId) {
  if (!customFrameworkStore[frameworkId]) return false;
  delete customFrameworkStore[frameworkId];
  return true;
}
