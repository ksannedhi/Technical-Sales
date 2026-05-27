/**
 * Pattern classification regression tests.
 * No test framework needed — run with: npm test (from backend/)
 *
 * Each case records:
 *   prompt        — the user input
 *   pattern       — expected ArchitecturePatternId
 *   minConfidence — minimum confidence the classifier must return
 *   useModel      — if true, expects shouldUseModelFallback to route to Claude
 *
 * Add new rows whenever a mis-classification is found and fixed.
 */
import { classifyPromptPattern } from "../services/patternLibrary.js";

// ─── Tiny assertion harness ──────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    passed++;
  } else {
    console.error(`  FAIL: ${msg}`);
    failed++;
  }
}

// ─── Test cases ───────────────────────────────────────────────────────────────

const cases: Array<{
  prompt: string;
  expectedPattern: string;
  minConfidence: number;
  note?: string;
}> = [
  // ── High-signal single keywords ────────────────────────────────────────────
  { prompt: "protect against ddos attacks on our web infrastructure", expectedPattern: "ddos-protection", minConfidence: 0.88 },
  { prompt: "deploy ndr sensor across our network segments", expectedPattern: "ndr-visibility", minConfidence: 0.88 },
  { prompt: "centralize logging into a siem platform", expectedPattern: "logging-siem", minConfidence: 0.88 },
  { prompt: "cloud workload protection for our containers", expectedPattern: "cloud-workload", minConfidence: 0.88 },
  { prompt: "deploy a waf in front of our app", expectedPattern: "waf-dmz", minConfidence: 0.88 },
  { prompt: "zero trust network access for remote employees", expectedPattern: "zero-trust", minConfidence: 0.88 },
  { prompt: "sase architecture for distributed workforce", expectedPattern: "sase-network", minConfidence: 0.88 },

  // ── Email security — should NOT mis-classify as hybrid-connectivity ────────
  { prompt: "email security gateway for our organization", expectedPattern: "email-security", minConfidence: 0.88, note: "email-security phrase boosts score" },
  { prompt: "secure email filtering with on-prem appliance", expectedPattern: "email-security", minConfidence: 0.88 },
  { prompt: "email security for on-prem exchange environment", expectedPattern: "email-security", minConfidence: 0.88 },

  // ── Wireless — should route IoT/NAS to Claude (generic), not wireless-network static ──
  { prompt: "corporate and guest wifi network segments", expectedPattern: "wireless-network", minConfidence: 0.82 },
  { prompt: "dual SSID wireless segmentation corporate employees and guest", expectedPattern: "wireless-network", minConfidence: 0.88, note: "ssid is unambiguous" },

  // ── VPN / remote access ────────────────────────────────────────────────────
  { prompt: "vpn remote access for home workers", expectedPattern: "remote-access", minConfidence: 0.88 },

  // ── Hybrid connectivity ────────────────────────────────────────────────────
  { prompt: "secure hybrid connectivity between on-prem data center and cloud", expectedPattern: "hybrid-connectivity", minConfidence: 0.88 },

  // ── Partner API ────────────────────────────────────────────────────────────
  { prompt: "secure api gateway for business partner integrations", expectedPattern: "partner-api-security", minConfidence: 0.88 },

  // ── Core DMZ — topology with explicit dmz + core network keywords ─────────
  { prompt: "enterprise core network with DMZ and internal servers", expectedPattern: "core-dmz", minConfidence: 0.88, note: "dmz+enterprise scores ≥5" },

  // ── Branch networking ──────────────────────────────────────────────────────
  { prompt: "branch office connectivity to HQ over sd-wan", expectedPattern: "branch-networking", minConfidence: 0.82 },

  // ── SSO / identity ─────────────────────────────────────────────────────────
  { prompt: "single sign on with mfa for enterprise applications", expectedPattern: "identity-access", minConfidence: 0.88 },

  // ── Segmentation ──────────────────────────────────────────────────────────
  { prompt: "network segmentation with least privilege access controls", expectedPattern: "segmentation", minConfidence: 0.82 },

  // ── Sandbox ────────────────────────────────────────────────────────────────
  { prompt: "malware sandbox detonation environment for threat analysis", expectedPattern: "sandbox-analysis", minConfidence: 0.88 },
];

// ─── Run ──────────────────────────────────────────────────────────────────────

console.log(`\nPattern classification — ${cases.length} cases\n`);

for (const tc of cases) {
  const result = classifyPromptPattern(tc.prompt);
  const patternOk = result.pattern === tc.expectedPattern;
  const confOk = result.confidence >= tc.minConfidence;
  const ok = patternOk && confOk;

  if (ok) {
    passed++;
    console.log(`  ✓ "${tc.prompt.slice(0, 60)}"`);
  } else {
    failed++;
    console.error(`  ✗ "${tc.prompt.slice(0, 60)}"`);
    if (!patternOk) console.error(`      pattern: expected "${tc.expectedPattern}", got "${result.pattern}"`);
    if (!confOk) console.error(`      confidence: expected ≥${tc.minConfidence}, got ${result.confidence}`);
    if (tc.note) console.error(`      note: ${tc.note}`);
  }
}

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
