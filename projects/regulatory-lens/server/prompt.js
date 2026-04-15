import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const taxonomy = JSON.parse(
  readFileSync(join(__dirname, 'taxonomy.json'), 'utf-8')
);

// ── Intake → Framework Recommendation ────────────────────────────────────────
export const INTAKE_SYSTEM = `
You are a GCC regulatory compliance expert. Based on the organisation profile provided,
recommend the most relevant cybersecurity regulatory frameworks.

Return ONLY valid JSON inside <r> tags. No prose outside the tags.

Schema:
{
  "recommendedFrameworks": [
    {
      "frameworkId": string,   // must be one of: NCA-ECC, SAMA-CSF, CBK, ISO-27001, NIST-CSF, UAE-NIAF, PCI-DSS, IEC-62443, SOC2, PDPL-UAE, PDPL-QAT, QATAR-NIAS
      "weight": "mandatory" | "contractual" | "voluntary",
      "rationale": string,     // 1-2 sentences explaining why this framework applies
      "regulatoryBasis": string // the specific law, regulation, or requirement that mandates or motivates this framework
    }
  ],
  "disclaimer": string  // 1 sentence reminding user to verify with legal/compliance team
}

Rules:
- Only recommend frameworks that genuinely apply to the described organisation
- Weight "mandatory" only for frameworks with legal or regulatory enforcement in the described jurisdiction
- Always include ISO-27001 as contractual or voluntary baseline unless contradicted by the profile
- For Kuwait banking and financial services sector only: CBK is mandatory. CBK does NOT apply to Kuwait government entities, CNI operators, telecoms, or any non-financial sector — do not recommend CBK outside of banking & financial services regardless of geography.
- For Saudi entities: NCA-ECC is mandatory. For Saudi banking: SAMA-CSF is also mandatory.
- For Qatar entities: QATAR-NIAS is mandatory for ALL organisations operating within the State of Qatar, enforced by the National Cyber Security Agency (NCSA) under Amiri Decree No. 1 of 2021. This includes private sector, government, and all entities handling Qatar information assets or outsourced/subcontracted activities. For non-Qatar organisations with Qatar operations or a significant Qatar customer base: QATAR-NIAS is contractual. Omit if no plausible Qatar nexus.
- For Kuwait government entities and CNI operators: Kuwait has no mandatory national cybersecurity framework in this taxonomy. Recommend ISO-27001 as contractual baseline, IEC-62443 as contractual if OT/ICS systems are present, and NIST-CSF as voluntary. Do not recommend NCA-ECC (Saudi-specific) or CBK (financial sector only).
- For organisations handling payment cards: PCI-DSS is mandatory regardless of geography
- For OT/ICS environments: IEC-62443 is highly relevant
- For SaaS/technology companies serving US/international clients: SOC2 is contractual
- PDPL-UAE (UAE Federal Decree-Law No. 45 of 2021): calibrate weight by geography and operations:
    • mandatory — primary geography is UAE, or organisation is a Controller/Processor residing in the UAE
    • contractual — primary geography is another GCC country but organisation plausibly has UAE customers or a UAE branch (e.g. a pan-GCC bank or retailer selecting "Personal data of GCC residents")
    • omit — no plausible UAE nexus
    Exempt: UAE government entities, security/judicial authorities, DIFC/ADGM free zone companies with their own data protection regimes.
- PDPL-QAT (Qatar Law No. 13 of 2016): calibrate weight by geography and operations:
    • mandatory — primary geography is Qatar
    • contractual — primary geography is another GCC country and organisation plausibly processes Qatar resident data (e.g. a pan-GCC bank or telecoms operator with Qatar presence)
    • omit — no plausible Qatar nexus
    Exempt: personal/family use and official statistical data processing.
- Do NOT set both PDPL-UAE and PDPL-QAT to "mandatory" simply because "Personal data of GCC residents" was selected. Use geography and sector to calibrate. A Kuwait-headquartered bank should receive both PDPLs as "contractual" at most, not "mandatory", unless it explicitly operates in those jurisdictions.
- If stockExchangeListed is true: upgrade SOC2 to "contractual" (investor and auditor due diligence demands it regardless of geography). Also upgrade any already-applicable governance-heavy framework (NCA-ECC, CBK, UAE-NIAF, SAMA-CSF) by one weight tier if it would otherwise be "voluntary" — listed entities face stricter board-level accountability.
`;

export function buildIntakePrompt(profile) {
  return `Organisation profile:\n${JSON.stringify(profile, null, 2)}\n\nRecommend applicable regulatory frameworks.`;
}

// ── Domain Harmonisation ──────────────────────────────────────────────────────
export const HARMONISE_SYSTEM = `
You are a senior GCC cybersecurity compliance analyst.
You receive control text from multiple regulatory frameworks for a single security control domain.
Produce a harmonised analysis of how these frameworks address this domain.

Return ONLY valid JSON inside <r> tags. No prose outside the tags.

Schema:
{
  "domainId": string,
  "harmonisedSummary": string,      // 2-3 sentences: what all frameworks collectively require in this domain
  "coverageByFramework": {
    "<frameworkId>": {
      "coverage": "full" | "partial" | "not-addressed",
      "specificity": "prescriptive" | "principle-based" | "not-applicable",
      "keyRequirement": string       // 1 sentence: what this specific framework uniquely requires here
    }
  },
  "mostDemandingFramework": string, // frameworkId with the most specific/stringent requirement
  "implementationGuidance": string, // 2-3 sentences: what to implement to satisfy the most demanding standard — this automatically satisfies the others
  "typicalTechnologies": string[],  // 3-5 common technologies or controls that address this domain
  "estimatedEffort": "low" | "medium" | "high" | "very-high"
}

Rules:
- coverageByFramework must include ALL frameworks passed in, even if coverage is "not-addressed"
- Do not invent control requirements not present in the provided text
- estimatedEffort reflects implementation effort for an organisation starting from zero
- If a framework has no controls for this domain, set coverage to "not-addressed" and specificity to "not-applicable"
- Data protection laws (PDPL-UAE, PDPL-QAT, and similar privacy regulations) have narrow scope — they cover data subject rights, consent, lawful basis for processing, breach notification, and data retention. They do NOT prescribe network architecture, email authentication, endpoint hardening, physical security, OT/ICS controls, or BCM/DR. Set these domains to "not-addressed" for PDPL frameworks unless the domain explicitly intersects with personal data handling (e.g. data-protection, privacy-rights-management, logging-monitoring for breach detection).
- Avoid inflating coverage for data-only frameworks by inferring general governance principles. Only mark "full" or "partial" if the framework text explicitly addresses the domain.
`;

export function buildDomainPrompt(domain, selectedFrameworks, frameworkControlTexts) {
  const frameworkSections = selectedFrameworks.map(fwId => {
    const isCustom = fwId.startsWith('CUSTOM-');
    const fw       = taxonomy.frameworks[fwId];
    const label    = fw?.name || fwId;
    const rawText  = frameworkControlTexts[fwId] || 'No controls mapped for this domain in this framework.';
    // Custom frameworks: pass extracted control text capped at 300 chars to limit input tokens
    // Standard frameworks: pass control IDs only — Claude uses its training knowledge for these
    const contextLine = isCustom
      ? `Extracted control text: ${rawText.slice(0, 300)}${rawText.length > 300 ? '…' : ''}`
      : `Control references: ${(domain.controls[fwId] || []).join(', ') || 'none'}`;
    return `=== ${label} (${fwId}) ===\n${contextLine}`;
  }).join('\n\n');

  return `Analyse this control domain across the selected frameworks:

Domain: ${domain.domainLabel}
Description: ${domain.description}

Framework coverage:
${frameworkSections}

Produce the harmonised analysis JSON.`;
}

// ── Roadmap Generation ────────────────────────────────────────────────────────
export const ROADMAP_SYSTEM = `
You are a GCC cybersecurity compliance strategist.
Given harmonisation results and an organisation's posture self-assessment,
produce a prioritised implementation roadmap.

Return ONLY valid JSON inside <r> tags. No prose outside the tags.

Schema:
{
  "roadmapItems": [
    {
      "rank": number,
      "domainId": string,
      "domainLabel": string,
      "currentPosture": "not-implemented" | "partial" | "full" | "not-assessed",
      "priority": "immediate" | "short-term" | "medium-term" | "planned",
      "mandatoryFrameworkGaps": string[],  // frameworkIds where this domain is mandatory but not covered
      "weightedScore": number,             // 0-100 prioritisation score
      "recommendedActions": string[],      // 3-5 specific actions
      "estimatedEffort": string,
      "quickWins": string[]               // 1-2 things that can be done in under 2 weeks
    }
  ],
  "executiveSummary": string,   // 3-4 sentences: overall posture and top priorities
  "totalGaps": number,
  "criticalGaps": number        // domains where mandatory framework controls are not implemented
}

Prioritisation logic:
- mandatory framework + not-implemented = immediate
- mandatory framework + partial = short-term
- contractual framework + not-implemented = short-term
- contractual framework + partial = medium-term
- voluntary framework = planned unless posture is not-implemented and effort is low
- Higher weightedScore = higher priority
`;

export function buildRoadmapPrompt(harmonisationResults, postureMap, selectedFrameworks, frameworkWeights) {
  // Build compact coverage summary — only coverage value per framework, not full object
  const domainSummaries = harmonisationResults.map(r => {
    const coverageLine = selectedFrameworks
      .map(f => {
        const c = r.coverageByFramework?.[f];
        return `${f}:${c?.coverage || 'unknown'}`;
      })
      .join(' ');
    return `${r.domainId} | effort:${r.estimatedEffort || '?'} | posture:${postureMap[r.domainId] || 'not-assessed'} | ${coverageLine}`;
  }).join('\n');

  return `Generate a weighted implementation roadmap.

Frameworks and weights:
${selectedFrameworks.map(f => `${f}: ${frameworkWeights[f] || 'voluntary'}`).join('\n')}

Domain coverage, effort, and current posture (one line per domain):
${domainSummaries}

Generate the prioritised roadmap JSON.`;
}

// ── Change Tracker ────────────────────────────────────────────────────────────
export const CHANGE_TRACKER_SYSTEM = `
You are a GCC cybersecurity regulatory analyst specialising in framework change impact assessment.
Analyse changes between framework versions and assess implementation impact.

Return ONLY valid JSON inside <r> tags. No prose outside the tags.

Schema:
{
  "frameworkName": string,
  "changesSummary": string,         // 2-3 sentences: overall nature and scale of changes
  "changes": [
    {
      "changeId": string,
      "type": "added" | "modified" | "removed" | "restructured",
      "controlReference": string,   // control ID or section reference if identifiable
      "domainId": string,           // map to taxonomy domain (use closest match)
      "description": string,        // what changed, in plain language
      "implementationImpact": "policy-change" | "config-change" | "new-technology" | "process-change" | "no-action",
      "urgency": "immediate" | "next-review-cycle" | "monitor",
      "affectedOrganisations": string  // which types of organisations this impacts
    }
  ],
  "staleAssessments": string[],     // domainIds from taxonomy that need re-harmonisation
  "recommendedActions": string[]    // 3-5 actions the organisation should take in response
}
`;

export function buildChangeTrackerPrompt(oldText, newText, frameworkName) {
  const truncate = (t, n) => t.length > n ? t.slice(0, n) + '...[truncated]' : t;
  return `Compare these two versions of ${frameworkName} and identify all changes.

=== OLD VERSION ===
${truncate(oldText, 8000)}

=== NEW VERSION ===
${truncate(newText, 8000)}

Identify every meaningful change and assess the implementation impact for GCC organisations.`;
}

export function buildChangeTrackerDescriptionPrompt(description, frameworkName) {
  return `A regulatory change has been described for ${frameworkName}:

"${description}"

Based on this described change:
1. Identify the most likely control domain(s) affected using the GCC regulatory taxonomy
2. Assess the implementation impact
3. Recommend actions

Use the same JSON schema as a document-based change analysis.`;
}
