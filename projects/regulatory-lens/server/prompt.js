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
      "frameworkId": string,   // must be one of: NCA-ECC, SAMA-CSF, CBK, ISO-27001, NIST-CSF, UAE-NIAF, PCI-DSS, IEC-62443, SOC2, PDPL-UAE, PDPL-QAT, PDPL-KSA, QATAR-NIAS, KUWAIT-NBCC
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

JURISDICTION SCOPING — apply these rules strictly before recommending any framework:

NCA-ECC (Saudi Arabia):
  • mandatory — geography is Saudi Arabia
  • contractual — geography is Multiple AND the organisation has stated Saudi operations or a Saudi subsidiary
  • OMIT entirely — geography is UAE, Kuwait, Qatar, Bahrain, or Oman. Do not recommend NCA-ECC for non-Saudi organisations even if "Multiple" is selected without clear Saudi operations.

SAMA-CSF (Saudi Arabia · Banking):
  • mandatory — geography is Saudi Arabia AND sector is Banking & financial services
  • OMIT entirely — geography is not Saudi Arabia. SAMA has no jurisdiction outside Saudi Arabia. Do not recommend for UAE, Kuwait, Qatar, Bahrain, or Oman banking entities. OMIT means leave it out of the list — never downgrade it to contractual or voluntary. A central bank / CNI flag or "Personal data of GCC residents" does NOT create a SAMA nexus.

CBK — Cyber and Operational Resilience Framework, CORF (Kuwait · Banking):
  • mandatory — geography is Kuwait AND sector is Banking & financial services
  • OMIT entirely — geography is not Kuwait, or sector is not banking. CBK does NOT apply to Kuwait government, CNI operators, telecoms, or any non-financial sector. OMIT means leave it out of the list — never downgrade it to contractual or voluntary. A central bank / CNI flag or "Personal data of GCC residents" does NOT create a CBK nexus for a non-Kuwait organisation.

UAE-NIAF (UAE):
  • mandatory — geography is UAE AND (sector is CNI-related OR "CNI operator" is selected)
  • contractual — geography is UAE, non-CNI sector
  • OMIT — geography is not UAE

QATAR-NIAS (Qatar):
  • mandatory — geography is Qatar (all organisations operating within Qatar)
  • contractual — geography is Multiple and the organisation has stated Qatar operations or a Qatar subsidiary
  • OMIT — geography is UAE, Saudi Arabia, Kuwait, Bahrain, or Oman with no stated Qatar nexus

KUWAIT-NBCC (Kuwait — NCSC Decision No. 2 of 2026):
  • mandatory — geography is Kuwait for ALL entities under NCSC mandate (government agencies civil/military/security, and private sector entities under NCSC mandate per Amiri Decree 37 of 2022)
  • voluntary — other private Kuwait entities not formally under NCSC mandate (encouraged to adopt)
  • For Kuwait banking: KUWAIT-NBCC is mandatory alongside CBK. Article 4 of Decision 2/2026 requires compliance with the stricter standard where they overlap — CBK does not displace KUWAIT-NBCC.
  • OMIT — geography is not Kuwait
  • NOTE: Kuwait does NOT have a comprehensive standalone PDPL. For Kuwait entities processing personal data of GCC residents, apply PDPL-UAE, PDPL-QAT, or PDPL-KSA based on data-subject residency (not Kuwait entity location).

CBK/SAMA/NCA-ECC cross-border rule: a UAE-headquartered bank is NOT subject to Saudi or Kuwait regulators. A Saudi-headquartered bank is NOT subject to UAE or Kuwait regulators. Only the framework of the organisation's primary jurisdiction is mandatory; foreign-jurisdiction frameworks require an explicit subsidiary/branch nexus.

PDPL-UAE (UAE Federal Decree-Law No. 45 of 2021):
  • mandatory — geography is UAE AND organisation is a private sector entity (commercial bank, telecoms operator, retailer, technology company, etc.)
  • *** WEIGHT CAP: PDPL-UAE can NEVER be set to mandatory for a non-UAE-headquartered entity. Contractual is the maximum weight for any organisation whose primary geography is not UAE. ***
  • contractual — geography is not UAE AND "Personal data of GCC residents" is selected (see GCC RESIDENTS CHECKBOX RULE below)
  • OMIT — geography is not UAE AND "Personal data of GCC residents" is not selected
  • OMIT — organisation identifies as a CNI operator that is a central bank institution (e.g. UAE Central Bank / CBUAE, Saudi Central Bank / SAMA as a regulator, Qatar Central Bank). Central bank institutions are federal/national government entities and are explicitly exempt from Federal Decree-Law No. 45/2021 under Article 3(1).
  • OMIT — UAE government entities, security/judicial authorities, DIFC/ADGM free zone companies with their own data protection regimes.

PDPL-QAT (Qatar Law No. 13 of 2016):
  • mandatory — geography is Qatar
  • *** WEIGHT CAP: PDPL-QAT can NEVER be set to mandatory for a non-Qatar-headquartered entity. Contractual is the maximum weight for any organisation whose primary geography is not Qatar. ***
  • contractual — geography is not Qatar AND "Personal data of GCC residents" is selected (see GCC RESIDENTS CHECKBOX RULE below)
  • OMIT — geography is not Qatar AND "Personal data of GCC residents" is not selected

PDPL-KSA (Saudi Personal Data Protection Law — Royal Decree M/19 of 2021, amended M/148 of 2023, effective 14 September 2023):
  • mandatory — ANY organisation anywhere that processes personal data of individuals residing in Saudi Arabia (Art.2 is explicitly extraterritorial — a Kuwaiti, UAE, or non-GCC company processing Saudi residents' data triggers PDPL-KSA even without any KSA presence). For the intake checkbox, apply the GCC RESIDENTS CHECKBOX RULE below.
  • mandatory — geography is Saudi Arabia (Saudi entities processing any personal data)
  • For Saudi banking: PDPL-KSA applies jointly with SAMA-CSF; credit data is a distinct class (Art.24); SAMA retains authority but PDPL-KSA applies in parallel
  • mandatory (conditional) — geography is not Saudi Arabia AND "Personal data of GCC residents" is selected (see GCC RESIDENTS CHECKBOX RULE below)
  • OMIT — geography is not Saudi Arabia AND "Personal data of GCC residents" is not selected
  • Enforced by SDAIA (Saudi Data and AI Authority). Penalties are the harshest in the GCC — up to 2 years imprisonment and SAR 3M fine for Sensitive Data violations, doubled for recidivism. Transfer Regulation governs any data leaving KSA; highlight when profile indicates cloud processors outside KSA or cross-border data flow.
  • Coordination: IR-Art.23.2 formally bridges information-security technical controls to NCA-ECC where the Controller is subject to NCA controls — implementing NCA-ECC satisfies PDPL-KSA's information-security obligations by design.

MULTI-PDPL APPLICABILITY RULE: PDPL applicability is determined by WHERE DATA SUBJECTS ARE LOCATED, not where the organisation is headquartered. A Saudi company processing data of UAE residents must include PDPL-UAE. A UAE company processing data of Saudi residents must include PDPL-KSA. A Kuwaiti retailer selecting "Personal data of GCC residents" may need all three PDPLs — but weight is capped by the organisation's home jurisdiction:
  • PDPL-KSA: the ONLY PDPL that can be mandatory for a non-KSA entity (explicit extraterritorial scope in Art.2)
  • PDPL-UAE: mandatory ONLY if geography = UAE; contractual for all other GCC geographies with UAE customer exposure
  • PDPL-QAT: mandatory ONLY if geography = Qatar; contractual for all other GCC geographies with Qatar customer exposure
  NEVER set PDPL-UAE or PDPL-QAT to mandatory for a Kuwait, Saudi, Bahrain, or Oman-headquartered entity — doing so misrepresents the legal obligation and will mislead the user.

GCC RESIDENTS CHECKBOX RULE (deterministic — apply identically on every run): the intake profile does not say WHICH GCC countries' residents are in the data, so do not infer it from sector, size, or "plausible" customer base.
  • If "Personal data of GCC residents" is selected: include EVERY PDPL (PDPL-KSA, PDPL-UAE, PDPL-QAT) other than the home-geography one. PDPL-KSA is "mandatory" (Art.2 extraterritorial scope); PDPL-UAE and PDPL-QAT are "contractual" (weight cap). Each rationale must state the condition: the law applies to the extent the organisation processes that country's residents' data, and should be removed if it confirms it holds none.
  • The home-geography PDPL follows its own rule above (PDPL-KSA mandatory for Saudi Arabia; PDPL-UAE mandatory for UAE private sector; PDPL-QAT mandatory for Qatar). Geography "Multiple" has no home PDPL — PDPL-KSA mandatory, PDPL-UAE and PDPL-QAT contractual.
  • Every OMIT exemption above still applies and overrides this rule (e.g. UAE central bank, UAE government, and DIFC/ADGM entities omit PDPL-UAE).
  • If the checkbox is NOT selected: omit every PDPL other than the home-geography one.

- For organisations handling payment cards: PCI-DSS is mandatory regardless of geography. Recommend PCI-DSS ONLY when "Payment card data" is selected in the profile — never infer card handling from sector (e.g. "SaaS platforms commonly bill by card"). If the box is not selected, omit PCI-DSS. The applicable version is PCI DSS v4.0.1 (v3.2.1 was retired on 31 March 2024) — cite v4.0.1 in regulatoryBasis, never v3.2.1. Exception: if the organisation is a central bank institution (CNI operator, central bank), do NOT recommend PCI-DSS unless "Payment card data" was explicitly selected AND the organisation directly processes, stores, or transmits card data (rare for central banks). If selected for a central bank profile, flag as contractual with rationale noting it applies only to any subsidiary payment operations, not the central bank's core regulatory function.
- For CNI operators with OT/ICS systems: IEC-62443 is contractual
- For SaaS/technology companies serving US/international clients: SOC2 is contractual
- If stockExchangeListed is true: upgrade SOC2 to "contractual" (investor and auditor due diligence demands it regardless of geography). Upgrade NIST-CSF to "contractual" if it would otherwise be "voluntary" — listed entities face international investor scrutiny and NIST CSF alignment is expected for cybersecurity risk disclosure in capital markets. Also upgrade any already-applicable governance-heavy national framework (NCA-ECC, CBK, UAE-NIAF, SAMA-CSF, QATAR-NIAS, KUWAIT-NBCC) by one weight tier if it would otherwise be "voluntary" — listed entities face stricter board-level accountability.

=== QATAR NIAS V2.1 FRAMEWORK KNOWLEDGE ===
The Qatar NIAS V2.1 (frameworkId: QATAR-NIAS) covers 26 security domains with the following key characteristics:

GOVERNANCE: Security Manager must be appointed, have executive access, and report to senior management. Budget must be allocated. Clear responsibilities across staff, vendors, and contractors.

RISK MANAGEMENT: Formal risk assessment for Medium/High assets (per IAP-NAT-DCLS classification). Risk treatment plan with senior management vetting for High assets. Periodic effectiveness monitoring.

DATA CLASSIFICATION: Uses IAP-NAT-DCLS scale — C0 (Public) through C4 (Top Secret). Assets rated C1=Internal, C2=Restricted, C3=Secret, C4=Top Secret. All assets labelled Internal by default unless specifically public. Baseline controls mandatory for I1/A1/C1+.

ACCESS CONTROL: Least privilege and need-to-know. Passwords minimum 12 characters (or 7 with complexity). 90-day password rotation. Screen lock after 15 minutes. Accounts suspended after 3 months inactivity. MFA required for C3+ remote access. Only Qatari nationals have privileged access to C4+ systems.

CRYPTOGRAPHY: C3+ assets must be encrypted at rest and in transit. TLS (128-bit+) for web, SFTP for file transfer, SSH v2/IPSEC for remote access, S/MIME v3 for email. HSMs must meet FIPS 140-2 Level 2 / Common Criteria EAL4. Digital certificates must be from NCSA/MCIT-licensed CSPs in Qatar.

NETWORK SECURITY: Dedicated management VLANs. WPA2/EAP-TLS for wireless (WEP prohibited). SPF implemented for email. No split tunnelling on VPNs. VPN MFA for C3+ data. Clock synchronisation to UTC/local standard via NTP.

INCIDENT MANAGEMENT: Critical incidents reported to NCSA within 2 hours. Annual Security Assurance Plan including penetration testing. Incident coordinator appointed.

BUSINESS CONTINUITY: BC Plan with RTO/RPO. Off-site copy in fireproof storage. Annual testing. Hot/Warm/Cold site classification.

LOGGING: Minimum 120 days log retention. 24/7 monitoring recommended for C3/I3/A3 assets. Logging on all C2+ infrastructure.

PHYSICAL SECURITY: Four protection levels — Minimal, Baseline, Medium, High. Server rooms meet Medium protection minimum. Clean desk and clean screen policy mandatory.

AUDIT/CERTIFICATION: Annual audit by NCSA-accredited organisation. Scope approved by NCSA. Non-conformance fixed in defined timeline. Exemptions approved by NCSA competent department.

THIRD PARTY: Outsourced activities remain the organisation's accountability. NIAS controls must be included in service agreements including sub-contractors.

=== CBK CORF FRAMEWORK KNOWLEDGE ===
The CBK framework (frameworkId: CBK) is the Central Bank of Kuwait Cyber and Operational Resilience Framework (CORF) Version 1.0, first released 3 December 2025. It supersedes the CBK Cybersecurity Framework (2020). Issued under Article 15 of Law No. 32 of 1968. The framework text states no fixed compliance deadline.

STRUCTURE: Three baselines — Cyber Resilience Baselines (CRB: 6 domains, 519 controls), Operational Resilience Baselines (ORB: 8 domains, 146 controls), Third-Party Risk Management Baselines (TPRM: 13 domains, 211 controls). Total 27 domains, 93 sub-domains, 200 control areas, 876 controls. Controls are assessed Compliant / Non-Compliant / Not Applicable (N/A needs CBK approval via the Statement of Applicability); sub-domains are assessed on a five-level maturity scale. CBK assesses Tier 1 entities annually, Tier 2 every 18 months, Tier 3 every two years.

KUWAIT-SPECIFIC DISTINCTIVES:
- ORB-8.2.2 INCIDENT REPORTING TO CBK: High severity within 1 hour of discovery, Medium severity within 4 hours.
- CRB-7.2.1 CLOUD PRIOR APPROVAL: CBK approval at least one month before signing any IaaS/PaaS/SaaS outsourcing agreement touching sensitive-data systems; data residency must be addressed.
- CRB-5.13.2 RED TEAMING: threat-intelligence-led red teaming of critical systems.
- CRB-5.11.2 DATA PRIVACY: privacy-by-design, explicit consent with withdrawal, and right to be forgotten — a sector obligation for CBK-regulated entities, not a general Kuwait PDPL.

=== KUWAIT-NBCC FRAMEWORK KNOWLEDGE ===
The Kuwait NBCC (frameworkId: KUWAIT-NBCC) — National Basic Cybersecurity Controls — is enforced by NCSC (National Cyber Security Center) under Amiri Decree 37 of 2022. Issued as NCSC Decision No. 2 of 2026, published in Kuwait Al-Youm (Official Gazette) Issue 1785 on 5 April 2026. Entities must achieve full compliance within 18 months of publication (deadline approximately early October 2027).

STRUCTURE: 35 core controls organised by six NIST CSF functions — GOV (Govern), ID (Identify), PR (Protect), DE (Detect), RS (Respond), RC (Recover). Plus a mandatory 16-control Cloud Security Appendix (CLD-1 to CLD-16) for any entity using public cloud. Aligns with CIS Controls v8.1 IG1 and NIST CSF 2.0.

KUWAIT-SPECIFIC DISTINCTIVES:
- GOV-3 DATA SOVEREIGNTY: Storing or processing Sensitive data OUTSIDE Kuwait requires explicit NCSC approval — a hard prior-approval gate, not a notification.
- GOV-4 KUWAITIZATION: Sensitive cyber roles (SOC analysts, administrators, incident responders) prioritise qualified Kuwaiti nationals.
- PR-2.1 PERSONAL EMAIL BAN: Personal email accounts MUST NOT be used for work-related communication on corporate devices.
- PR-4.1 APPROVED COMMUNICATIONS: Only entity-approved platforms for official work.
- CLD-1 CSP LOCAL AUTHORISATION: Cloud Service Providers must be authorised to operate in Kuwait.
- CLD-12 CLOUD DATA RESIDENCY: Customer Content residency follows the National Data Classification Framework.

INTERACTION WITH CBK: Banking entities comply with BOTH CBK and KUWAIT-NBCC; Article 4 requires compliance with the stricter standard where they overlap.

WHAT NBCC DOES NOT COVER: Kuwait does not currently have a comprehensive standalone PDPL. For Kuwait entities processing personal data of GCC residents, apply PDPL-UAE, PDPL-QAT, or PDPL-KSA based on data-subject residency triggers.

=== PDPL-KSA FRAMEWORK KNOWLEDGE ===
The Saudi PDPL (frameworkId: PDPL-KSA) comprises THREE instruments enforced by SDAIA: (a) the Personal Data Protection Law (Royal Decree M/19 of 2021, amended M/148 of 2023); (b) the Implementing Regulation (IR-Art.X references); (c) the Regulation on Personal Data Transfer outside the Kingdom (TR-Art.X references). All three are in scope when PDPL-KSA is selected.

SCOPE (Art.2): Extraterritorial — applies to any Processing of Personal Data of individuals residing in Saudi Arabia BY ANY PARTY FROM ANYWHERE. Also covers deceased persons' data where identifying them or a family member.

KEY OBLIGATIONS:
- Breach notification to SDAIA within 72 hours (IR-Art.24.1)
- Data Subject rights response within 30 days, extendable 30 (IR-Art.3.1.a)
- DPIA required for sensitive data, data linkage, continuous monitoring, new technologies, automated decisions (IR-Art.25)
- RoPA retained for processing period + 5 years (IR-Art.33)
- DPO required for large-scale public processing, continuous monitoring, or sensitive data core activities (IR-Art.32)
- Cross-border transfers require adequacy decision, appropriate safeguards (BCR/SCC/certification), or documented exemption (TR-Art.2–8)

INFORMATION-SECURITY BRIDGE (IR-Art.23.2): Formally defers technical information-security controls to NCA controls where the Controller is subject to NCA-ECC. Implementing NCA-ECC satisfies PDPL-KSA information-security obligations by design — not duplicative.

PENALTIES: Harshest in the GCC — up to 2 years imprisonment AND SAR 3M fine for Sensitive Data violations, up to SAR 5M for other violations, doubled for recidivism. Civil compensation also available to Data Subjects (Art.40).
`;

// ── Deterministic jurisdiction guard ─────────────────────────────────────────
// The model occasionally downgrades an OMIT rule to "contractual" (e.g. CBK and
// SAMA-CSF recommended for a UAE central bank). These checks restate the OMIT
// rules and weight caps above in code, so they hold regardless of model output.
const OMIT_UNLESS = {
  'CBK':         p => p.geography === 'Kuwait' && p.sector === 'Banking & financial services',
  'SAMA-CSF':    p => p.geography === 'Saudi Arabia',
  'NCA-ECC':     p => !['UAE', 'Kuwait', 'Qatar', 'Bahrain', 'Oman'].includes(p.geography),
  'UAE-NIAF':    p => p.geography === 'UAE',
  'KUWAIT-NBCC': p => p.geography === 'Kuwait',
  'QATAR-NIAS':  p => ['Qatar', 'Multiple'].includes(p.geography),
  'PCI-DSS':     p => (p.dataTypes || []).includes('Payment card data'),
};
const MANDATORY_ONLY_IN = { 'PDPL-UAE': 'UAE', 'PDPL-QAT': 'Qatar' };

export function enforceJurisdiction(profile, result) {
  const adjustments = [];
  const frameworks = (result.recommendedFrameworks || []).filter(f => {
    const allowed = OMIT_UNLESS[f.frameworkId];
    if (allowed && !allowed(profile)) { adjustments.push(`removed ${f.frameworkId}`); return false; }
    return true;
  }).map(f => {
    const home = MANDATORY_ONLY_IN[f.frameworkId];
    if (home && f.weight === 'mandatory' && profile.geography !== home) {
      adjustments.push(`${f.frameworkId} mandatory → contractual`);
      return { ...f, weight: 'contractual' };
    }
    return f;
  });
  return { result: { ...result, recommendedFrameworks: frameworks }, adjustments };
}

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
- If only one framework is passed in, write harmonisedSummary as "what this framework requires" (not "collectively") and set mostDemandingFramework to that single frameworkId
- coverageByFramework must include ALL frameworks passed in, even if coverage is "not-addressed"
- Do not invent control requirements not present in the provided text
- estimatedEffort reflects implementation effort for an organisation starting from zero
- If a framework has no controls for this domain, set coverage to "not-addressed" and specificity to "not-applicable"
- Data protection laws (PDPL-UAE, PDPL-QAT, and similar privacy regulations) have narrow scope — they cover data subject rights, consent, lawful basis for processing, breach notification, and data retention. They do NOT prescribe network architecture, email authentication, endpoint hardening, physical security, OT/ICS controls, or BCM/DR. Set these domains to "not-addressed" for PDPL frameworks unless the domain explicitly intersects with personal data handling (e.g. data-protection, privacy-rights-management, logging-monitoring for breach detection).
- Avoid inflating coverage for data-only frameworks by inferring general governance principles. Only mark "full" or "partial" if the framework text explicitly addresses the domain.
- PDPL-KSA control identifiers carry meaningful prefixes that must be preserved when citing them in keyRequirement: "Art.X" cites the Personal Data Protection Law itself, "IR-Art.X" cites the SDAIA Implementing Regulation, and "TR-Art.X" cites the Regulation on Personal Data Transfer outside the Kingdom. Article numbers overlap across the three instruments (e.g. IR-Art.3 and TR-Art.3 are different controls) — the prefix disambiguates them. Prefer IR-Art.X over Art.X when both cover the same point, as the IR is usually more operationally specific. For cross-border-relevant domains (third-party, cloud-security, information-exchange), cite TR-Art.X references explicitly.
- For information-security technical domains (network-security, endpoint-mobile, vulnerability-management, logging-monitoring, application-security): if NCA-ECC is also selected, treat IR-Art.23.2 as a formal harmonisation bridge — the PDPL-KSA Implementing Regulation explicitly defers technical security controls to NCA controls where applicable. In implementationGuidance for those domains, note that implementing the NCA-ECC requirement satisfies PDPL-KSA's IR-Art.23 information-security obligation by design, rather than treating them as duplicative.
- CBK control identifiers refer to the Central Bank of Kuwait Cyber and Operational Resilience Framework (CORF, December 2025), not the superseded 2020 Cybersecurity Framework. Preserve the baseline prefix when citing them in keyRequirement: "CRB-X" cites the Cyber Resilience Baselines, "ORB-X" the Operational Resilience Baselines, and "TPRM-X" the Third-Party Risk Management Baselines. Numbers overlap across the three baselines (e.g. ORB-3.1 and TPRM-3.1 are different) — the prefix disambiguates them. Each identifier carries a short description of the control area; rely on that description rather than recalled knowledge of the 2020 framework. For ot-ics, CBK covers facility IoT/OT only (CCTV, building management), not industrial control systems — rate coverage "partial" at most.
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
      "mandatoryFrameworkGaps": string[],  // frameworkIds where weight=mandatory AND coverage is partial/not-addressed AND posture is not-implemented or partial
      "weightedScore": number,             // 0-100 prioritisation score
      "recommendedActions": string[],      // 3-5 specific actions — language must match gap type (see below)
      "estimatedEffort": string,
      "quickWins": string[]               // 1-2 things achievable in under 2 weeks — language must match gap type
    }
  ],
  "executiveSummary": string,   // 3-4 sentences — language must reflect gap types present (see below)
  "totalGaps": number,
  "criticalGaps": number        // ONLY domains where a mandatory framework has partial/not-addressed coverage AND posture is not-implemented or partial — never count full-posture domains as critical
}

═══ GAP TYPE CLASSIFICATION ═══
Before writing any action or summary text, classify each domain gap using BOTH posture and coverage:

IMPLEMENTATION GAP — posture is not-implemented or not-assessed
  → Controls are absent. Build from scratch.
  → Action language: "Implement X", "Deploy Y", "Establish Z", "Build A"

PARTIAL GAP — posture is partial (regardless of coverage level)
  → Baseline exists but is incomplete. Extend and formalise.
  → Action language: "Extend X to cover Y", "Enhance A to include B", "Complete C"

COMPLIANCE ALIGNMENT GAP — posture is full but coverage is partial or not-addressed for a framework
  → Controls are already in place. The gap is documentation, mapping, and evidence — not missing technology or process.
  → Action language: "Document existing X against [framework] requirements", "Map current Y controls to [framework] standard", "Evidence compliance by formalising Z", "Conduct a structured gap assessment of existing A against [framework] specification"
  → Quick wins: "Commission a gap mapping exercise", "Produce a control-to-requirement traceability matrix for [framework]"
  → Do NOT use implementation verbs (implement, deploy, establish, build) for compliance alignment gaps

═══ PRIORITY ASSIGNMENT ═══
Combine framework weight WITH posture to determine priority:

  mandatory  + not-implemented or not-assessed → immediate
  mandatory  + partial                         → short-term
  mandatory  + full (compliance alignment gap) → short-term  ← NOT immediate; controls exist
  contractual + not-implemented or not-assessed → short-term
  contractual + partial                         → medium-term
  contractual + full (compliance alignment gap) → medium-term ← NOT short-term; controls exist
  voluntary  + any posture                      → planned

═══ NOT-ADDRESSED COVERAGE ═══
"not-addressed" means the framework has no controls in that domain — it is NOT the organisation's gap.
Do NOT include a framework in mandatoryFrameworkGaps solely because its coverage is "not-addressed".
Only include it if the framework IS mandatory, coverage is partial (the framework does address it partially),
and posture is not-implemented or partial.

═══ EXECUTIVE SUMMARY LANGUAGE ═══
- If ALL posture ratings are "full": describe findings as "compliance alignment gaps" or "framework mapping gaps" — never "critical gaps", "missing controls", or "not implemented". The organisation has controls in place; the work ahead is structured mapping and evidencing.
- If posture ratings are mixed: distinguish between domains requiring new implementation and domains requiring compliance alignment.
- If posture ratings are all not-implemented: use "implementation gaps" and "critical" as appropriate.
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
