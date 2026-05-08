export type ArchitecturePatternId =
  | "partner-api-security"
  | "hybrid-identity-cloud"
  | "identity-access"
  | "wireless-network"
  | "hybrid-connectivity"
  | "remote-access"
  | "waf-dmz"
  | "email-security"
  | "ddos-protection"
  | "sandbox-analysis"
  | "ndr-visibility"
  | "branch-networking"
  | "logging-siem"
  | "segmentation"
  | "zero-trust"
  | "sase-network"
  | "cloud-workload"
  | "perimeter-firewall"
  | "generic-secure-architecture";

export interface PatternMatch {
  pattern: ArchitecturePatternId;
  modifiers: string[];
  confidence: number;
}

const patternRules: Array<{
  pattern: ArchitecturePatternId;
  test: (prompt: string) => boolean;
  score: (prompt: string) => number;
}> = [
  {
    pattern: "partner-api-security",
    test: (prompt) =>
      (/api/i.test(prompt) && /partner/i.test(prompt)) ||
      (/business partner/i.test(prompt) && /secure/i.test(prompt)),
    score: (prompt) => {
      let score = 0;
      if (/api/i.test(prompt)) score += 3;
      if (/partner|business partner/i.test(prompt)) score += 3;
      if (/oauth|oidc|mtls|certificate|gateway/i.test(prompt)) score += 2;
      return score;
    },
  },
  {
    pattern: "hybrid-identity-cloud",
    test: (prompt) =>
      (/(on-prem|on prem|ad|active directory)/i.test(prompt) && /(cloud apps|cloud app|saas|entra|azure ad)/i.test(prompt)) ||
      (/hybrid cloud/i.test(prompt) && /(identity|ad|cloud apps)/i.test(prompt)),
    score: (prompt) => {
      let score = 0;
      if (/hybrid cloud/i.test(prompt)) score += 3;
      if (/(ad|active directory|entra|azure ad|identity)/i.test(prompt)) score += 3;
      if (/(cloud apps|cloud app|saas)/i.test(prompt)) score += 2;
      return score;
    },
  },
  {
    pattern: "identity-access",
    test: (prompt) =>
      /(sso|single sign on|mfa|multi-factor|oidc|oauth|saml)/i.test(prompt) &&
      !/zero trust|identity-based/i.test(prompt),
    score: (prompt) => {
      let score = 0;
      if (/(sso|single sign on)/i.test(prompt)) score += 3;
      if (/(mfa|multi-factor)/i.test(prompt)) score += 3;
      if (/(oidc|oauth|saml)/i.test(prompt)) score += 2;
      return score;
    },
  },
  {
    pattern: "wireless-network",
    test: (prompt) =>
      /wifi|wi-fi|wireless|ssid/i.test(prompt) ||
      (/guest/i.test(prompt) && /corporate|employee|internal/i.test(prompt)),
    score: (prompt) => {
      let score = 0;
      if (/(wifi|wi-fi|wireless)/i.test(prompt)) score += 3;
      if (/ssid/i.test(prompt)) score += 4;
      if (/(guest|corporate|employee|internal)/i.test(prompt)) score += 2;
      return score;
    },
  },
  {
    pattern: "sandbox-analysis",
    test: (prompt) =>
      /sandbox|detonation/i.test(prompt) ||
      (/ingest/i.test(prompt) && /(email|firewall|soar)/i.test(prompt)),
    score: (prompt) => {
      let score = 0;
      if (/(sandbox|detonation)/i.test(prompt)) score += 4;
      if (/ingest/i.test(prompt)) score += 2;
      if (/(email|firewall|soar)/i.test(prompt)) score += 2;
      return score;
    },
  },
  {
    pattern: "ddos-protection",
    test: (prompt) => /ddos|scrubbing/i.test(prompt),
    score: (prompt) => (/ddos/i.test(prompt) ? 4 : 0) + (/scrubbing/i.test(prompt) ? 3 : 0),
  },
  {
    pattern: "email-security",
    test: (prompt) =>
      (/email|smtp|mx record/i.test(prompt) || /\bmail\b/i.test(prompt)) &&
      // Exclude attack-chain / threat-scenario prompts that mention email as a vector
      !/ransomware|attack (flow|chain|path)|kill chain|threat actor|lateral movement/i.test(prompt) &&
      // Exclude generic DMZ / multi-server prompts where mail is one of several servers
      !(/\bdmz\b/i.test(prompt) && /(web server|app server|application server)/i.test(prompt)),
    score: (prompt) => {
      let score = 0;
      if (/email|mail/i.test(prompt)) score += 3;
      if (/(smtp|mx record|exchange)/i.test(prompt)) score += 3;
      return score;
    },
  },
  {
    pattern: "waf-dmz",
    test: (prompt) => /waf|web application firewall/i.test(prompt),
    score: (prompt) => {
      let score = 0;
      if (/waf|web application firewall/i.test(prompt)) score += 4;
      if (/dmz/i.test(prompt)) score += 2;
      return score;
    },
  },
  {
    pattern: "remote-access",
    test: (prompt) => /vpn|remote access|home user/i.test(prompt),
    score: (prompt) => {
      let score = 0;
      if (/vpn/i.test(prompt)) score += 3;
      if (/remote access|home user/i.test(prompt)) score += 3;
      return score;
    },
  },
  {
    pattern: "hybrid-connectivity",
    test: (prompt) =>
      (/hybrid/i.test(prompt) || (/(on-prem|data center|dc)/i.test(prompt) && /(aws|azure|gcp|cloud)/i.test(prompt))) &&
      // Exclude data-protection / DLP prompts that mention on-prem + cloud but aren't about connectivity
      !(/protect(ing)? data|data protection|data loss|dlp/i.test(prompt) && !/(connect|connectivity|tunnel|vpn|link|circuit|expressroute|direct connect)/i.test(prompt)),
    score: (prompt) => {
      let score = 0;
      if (/hybrid/i.test(prompt)) score += 3;
      if (/(on-prem|data center|dc)/i.test(prompt)) score += 2;
      if (/(aws|azure|gcp|cloud)/i.test(prompt)) score += 2;
      if (/(vpn|direct connect|expressroute|secure connectivity|tunnel)/i.test(prompt)) score += 2;
      return score;
    },
  },
  {
    pattern: "branch-networking",
    test: (prompt) => /branch|sd-wan|hq|branch office/i.test(prompt),
    score: (prompt) => (/branch|branch office/i.test(prompt) ? 4 : 0) + (/sd-wan|hq/i.test(prompt) ? 2 : 0),
  },
  {
    pattern: "ndr-visibility",
    test: (prompt) => /ndr|east-west|visibility|server farm|dmz, core/i.test(prompt),
    score: (prompt) => {
      let score = 0;
      if (/ndr/i.test(prompt)) score += 4;
      if (/east-west|visibility/i.test(prompt)) score += 2;
      if (/server farm|dmz, core/i.test(prompt)) score += 2;
      return score;
    },
  },
  {
    pattern: "logging-siem",
    test: (prompt) => /siem|logging|centralized logging/i.test(prompt),
    score: (prompt) => (/siem/i.test(prompt) ? 4 : 0) + (/(logging|centralized logging)/i.test(prompt) ? 2 : 0),
  },
  {
    pattern: "zero-trust",
    test: (prompt) => /zero trust|identity-based/i.test(prompt),
    score: (prompt) => (/zero trust/i.test(prompt) ? 5 : 0) + (/identity-based/i.test(prompt) ? 2 : 0),
  },
  {
    pattern: "sase-network",
    test: (prompt) =>
      /\bsase\b/i.test(prompt) ||
      (/ztna/i.test(prompt) && /cloud/i.test(prompt)) ||
      (/sd-wan/i.test(prompt) && /cloud/i.test(prompt) && /security/i.test(prompt)) ||
      /secure access service edge/i.test(prompt),
    score: (prompt) => {
      let score = 0;
      if (/\bsase\b/i.test(prompt)) score += 9;
      if (/secure access service edge/i.test(prompt)) score += 9;
      if (/ztna/i.test(prompt)) score += 3;
      if (/sd-wan/i.test(prompt) && /security/i.test(prompt)) score += 2;
      if (/casb|swg|cloud firewall/i.test(prompt)) score += 2;
      return score;
    },
  },
  {
    pattern: "perimeter-firewall",
    test: (prompt) =>
      /firewall|router/i.test(prompt) &&
      /(perimeter|enterprise network|network edge|campus network|corporate network)/i.test(prompt) &&
      // Don't steal from WAF-specific or zero-trust prompts
      !/waf|web application firewall|zero trust|ztna/i.test(prompt),
    score: (prompt) => {
      let score = 0;
      if (/firewall/i.test(prompt)) score += 3;
      if (/router/i.test(prompt)) score += 3;
      if (/(perimeter|enterprise network|campus|corporate)/i.test(prompt)) score += 2;
      if (/(dmz|segment|vlan)/i.test(prompt)) score += 1;
      return score;
    },
  },
  {
    pattern: "cloud-workload",
    test: (prompt) => /cloud workload|landing zone|workload/i.test(prompt),
    score: (prompt) => (/cloud workload|landing zone|workload/i.test(prompt) ? 4 : 0),
  },
  {
    pattern: "segmentation",
    test: (prompt) => /segment|least privilege|inspection points/i.test(prompt),
    score: (prompt) => {
      let score = 0;
      if (/segment|least privilege/i.test(prompt)) score += 3;
      if (/inspection points/i.test(prompt)) score += 2;
      return score;
    },
  },
];

const modifierRules: Array<{ modifier: string; test: (prompt: string) => boolean }> = [
  { modifier: "aws", test: (prompt) => /\baws\b/i.test(prompt) },
  { modifier: "azure", test: (prompt) => /\bazure\b/i.test(prompt) },
  { modifier: "gcp", test: (prompt) => /\bgcp\b|google cloud/i.test(prompt) },
  { modifier: "on-prem", test: (prompt) => /on-prem|on prem|data center|dc/i.test(prompt) },
  { modifier: "cloud", test: (prompt) => /cloud|aws|azure|gcp|google cloud/i.test(prompt) },
  { modifier: "dmz", test: (prompt) => /\bdmz\b/i.test(prompt) },
  { modifier: "firewall", test: (prompt) => /firewall/i.test(prompt) },
  { modifier: "branch", test: (prompt) => /branch/i.test(prompt) },
  { modifier: "logging", test: (prompt) => /logging|siem/i.test(prompt) },
];

export function classifyPromptPattern(prompt: string): PatternMatch {
  const lower = prompt.toLowerCase();
  const matched = patternRules
    .filter((rule) => rule.test(lower))
    .map((rule) => ({ rule, score: rule.score(lower) }))
    .sort((left, right) => right.score - left.score)[0];
  const modifiers = modifierRules.filter((rule) => rule.test(lower)).map((rule) => rule.modifier);

  if (!matched) {
    return {
      pattern: "generic-secure-architecture",
      modifiers,
      confidence: 0.45,
    };
  }

  return {
    pattern: matched.rule.pattern,
    modifiers,
    confidence: matched.score >= 5 ? 0.88 : 0.82,
  };
}
