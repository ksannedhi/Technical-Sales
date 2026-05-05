// NCA ECC-2:2024 — sub-control IDs use dot notation (Domain.Subdomain.Control.SubControl)
const NCA_CONTROL_LIBRARY = {
  '2.4.3.1': 'Email phishing and spam filtering',
  '2.4.3.2': 'MFA for email remote and webmail access',
  '2.4.3.4': 'Email APT and zero-day malware protection',
  '2.4.3.5': 'Email domain validation (SPF, DKIM, DMARC)',
  '2.2.3.2': 'Multi-factor authentication for remote and privileged access',
  '2.2.3.4': 'Privileged access management',
  '2.5.3.3': 'Secure internet browsing and restriction of suspicious websites',
  '1.10.3.1': 'Cybersecurity awareness — secure handling of email and phishing',
  '2.13.3.1': 'Cybersecurity incident response plans and escalation procedures',
  '2.13.3.3': 'Reporting cybersecurity incidents to the NCA'
};

const NCA_CATEGORY_BASELINE = {
  sender:                ['2.4.3.5', '2.4.3.1'],
  headers:               ['2.4.3.5', '2.4.3.1'],
  links:                 ['2.5.3.3', '2.4.3.1'],
  credential_harvesting: ['2.2.3.2', '2.2.3.4'],
  impersonation:         ['2.4.3.1', '2.4.3.4'],
  urgency:               ['1.10.3.1', '2.13.3.1'],
  financial_fraud:       ['1.10.3.1', '2.13.3.1'],
  payload:               ['2.4.3.4', '2.4.3.1'],
  content:               ['1.10.3.1', '2.13.3.1']
};

const NCA_THREAT_PROFILE_OVERLAYS = {
  phishing:                  ['2.4.3.1', '2.4.3.5', '2.5.3.3', '1.10.3.1', '2.13.3.1'],
  business_email_compromise: ['2.4.3.1', '2.4.3.5', '2.2.3.2', '2.2.3.4', '1.10.3.1', '2.13.3.1'],
  malware_delivery:          ['2.4.3.4', '2.4.3.1', '2.5.3.3', '2.13.3.1'],
  credential_harvesting:     ['2.4.3.1', '2.4.3.5', '2.2.3.2', '2.2.3.4', '2.5.3.3', '1.10.3.1'],
  impersonation:             ['2.4.3.1', '2.4.3.4', '2.4.3.5', '1.10.3.1', '2.13.3.1'],
  financial_fraud:           ['2.4.3.1', '2.4.3.5', '2.2.3.2', '1.10.3.1', '2.13.3.1'],
  invoice_fraud:             ['2.4.3.1', '2.4.3.5', '2.2.3.2', '2.2.3.4', '1.10.3.1', '2.13.3.1']
};

const NCA_IMMEDIATE_CONTROLS = new Set(['2.4.3.5', '2.4.3.1', '2.2.3.2', '2.4.3.4']);

// ISO 27002:2022 — control IDs follow the Theme.Control numbering (e.g. 8.7, 5.26)
const ISO_CONTROL_LIBRARY = {
  '8.7':  'Protection against malware',
  '8.23': 'Web filtering',
  '8.5':  'Secure authentication',
  '8.2':  'Privileged access rights',
  '5.17': 'Authentication information',
  '6.3':  'Information security awareness, education and training',
  '5.26': 'Response to information security incidents'
};

const ISO_CATEGORY_BASELINE = {
  sender:                ['8.7', '8.5'],
  headers:               ['8.7', '8.5'],
  links:                 ['8.23', '8.7'],
  credential_harvesting: ['8.5', '8.2'],
  impersonation:         ['8.7', '6.3'],
  urgency:               ['6.3', '5.26'],
  financial_fraud:       ['6.3', '5.26'],
  payload:               ['8.7', '8.23'],
  content:               ['6.3', '5.26']
};

const ISO_THREAT_PROFILE_OVERLAYS = {
  phishing:                  ['8.7', '8.23', '6.3', '5.26'],
  business_email_compromise: ['8.7', '8.5', '8.2', '6.3', '5.26'],
  malware_delivery:          ['8.7', '8.23', '5.26'],
  credential_harvesting:     ['8.7', '8.5', '8.2', '5.17', '8.23'],
  impersonation:             ['8.7', '6.3', '5.26'],
  financial_fraud:           ['8.7', '8.5', '6.3', '5.26'],
  invoice_fraud:             ['8.7', '8.5', '8.2', '6.3', '5.26']
};

const ISO_IMMEDIATE_CONTROLS = new Set(['8.7', '8.5', '8.23']);

const THREAT_PROFILE_LABELS = {
  phishing:                  'Phishing',
  business_email_compromise: 'Business Email Compromise',
  malware_delivery:          'Malware Delivery',
  credential_harvesting:     'Credential Harvesting',
  impersonation:             'Impersonation',
  financial_fraud:           'Financial Fraud',
  invoice_fraud:             'Invoice Fraud'
};

const CATEGORY_DISPLAY_LABELS = {
  sender:                'Sender spoofing',
  headers:               'Header mismatch',
  links:                 'Malicious link',
  urgency:               'Urgency / social engineering',
  impersonation:         'Impersonation',
  payload:               'Malicious payload',
  content:               'Suspicious content',
  financial_fraud:       'Financial fraud / BEC',
  credential_harvesting: 'Credential harvesting'
};

function libraryFor(framework) {
  return framework === 'iso27001' ? ISO_CONTROL_LIBRARY : NCA_CONTROL_LIBRARY;
}

function categoryBaselineFor(framework) {
  return framework === 'iso27001' ? ISO_CATEGORY_BASELINE : NCA_CATEGORY_BASELINE;
}

function overlaysFor(framework) {
  return framework === 'iso27001' ? ISO_THREAT_PROFILE_OVERLAYS : NCA_THREAT_PROFILE_OVERLAYS;
}

function immediateControlsFor(framework) {
  return framework === 'iso27001' ? ISO_IMMEDIATE_CONTROLS : NCA_IMMEDIATE_CONTROLS;
}

export function getControlsForFinding(category, threatProfiles = [], framework = 'nca_ecc') {
  const baseline = categoryBaselineFor(framework);
  const overlays = overlaysFor(framework);
  const controls = new Set(baseline[category] ?? []);

  threatProfiles.forEach((profile) => {
    for (const controlId of overlays[profile] ?? []) {
      controls.add(controlId);
    }
  });

  return [...controls];
}

// Legacy alias used by deterministicChecks.js (NCA ECC path)
export function getEccControlsForFinding(category, threatProfiles = []) {
  return getControlsForFinding(category, threatProfiles, 'nca_ecc');
}

export function getControlName(controlId, framework = 'nca_ecc') {
  return libraryFor(framework)[controlId] ?? controlId;
}

export function getControlPriority(controlId, framework = 'nca_ecc') {
  return immediateControlsFor(framework).has(controlId) ? 'immediate' : 'short-term';
}

// Plain-English explanations of what each control actually requires,
// shown in the compliance gap table for both frameworks.
const NCA_CONTROL_EXPLANATIONS = {
  '2.4.3.1': 'Email phishing and spam filtering helps detect lookalike domains, malicious attachments, and suspicious sender patterns before they reach the inbox.',
  '2.4.3.2': 'MFA for email access limits the damage of credential theft — even if a user is deceived, stolen passwords alone cannot grant access.',
  '2.4.3.4': 'APT and zero-day protection sandboxes unknown payloads and URL destinations, blocking exploits and drive-by downloads that bypass signature detection.',
  '2.4.3.5': 'Domain validation (SPF, DKIM, DMARC) verifies the sending infrastructure matches the claimed domain, preventing spoofed and impersonated email from passing as legitimate.',
  '2.2.3.2': 'MFA for remote and privileged access raises the bar for account takeover following credential compromise from a phishing lure.',
  '2.2.3.4': 'Privileged access management restricts the blast radius if a high-value account is successfully phished or impersonated.',
  '2.5.3.3': 'Secure browsing and suspicious-site blocking intercepts traffic to attacker-controlled domains before the user reaches the credential-harvesting or malware page.',
  '1.10.3.1': 'Cybersecurity awareness training equips users to recognise phishing cues, impersonation, and social engineering, reducing the likelihood of engagement with malicious messages.',
  '2.13.3.1': 'Incident response and escalation procedures ensure rapid containment and investigation when a phish is detected, limiting potential data exposure and operational impact.',
  '2.13.3.3': 'Reporting cybersecurity incidents to the NCA satisfies the regulatory obligation to disclose significant email-borne attacks within the required timeframe.'
};

const ISO_CONTROL_EXPLANATIONS = {
  '8.7':  'Protection against malware requires controls that detect and block malicious code delivered via email — including weaponised attachments, embedded scripts, and links to malware-serving pages.',
  '8.23': 'Web filtering prevents users from reaching attacker-controlled sites by blocking access to URLs and domains identified as malicious, newly registered, or otherwise suspicious.',
  '8.5':  'Secure authentication mandates strong credential controls so that phished passwords alone are insufficient for account access — typically enforced through MFA and session management.',
  '8.2':  'Privileged access rights must be tightly controlled and scoped so that a compromised account cannot be leveraged for lateral movement or high-impact actions.',
  '5.17': 'Authentication information (passwords and secrets) must be protected against disclosure; this control is violated when a phishing lure successfully captures credentials.',
  '6.3':  'Information security awareness, education, and training ensures users can recognise social engineering, impersonation, and phishing attempts and know how to report them.',
  '5.26': 'Response to information security incidents requires a defined and practised process for detecting, containing, and recovering from email-borne attacks and credential compromise.'
};

export function buildComplianceGaps(findings, threatProfiles, framework) {
  const seen = new Set();
  const gaps = [];
  const explanations = framework === 'iso27001' ? ISO_CONTROL_EXPLANATIONS : NCA_CONTROL_EXPLANATIONS;

  for (const finding of findings) {
    const controls = framework === 'iso27001'
      ? (finding.isoControls ?? [])
      : (finding.eccControls ?? []);

    for (const controlId of controls) {
      if (!seen.has(controlId)) {
        seen.add(controlId);
        gaps.push({
          controlId,
          controlName: getControlName(controlId, framework),
          gap: explanations[controlId] ?? `This control was not effective in blocking the identified threat pattern.`,
          whyItMatters: explanations[controlId] ?? `Implementing this control reduces exposure to the identified threat.`,
          priority: getControlPriority(controlId, framework)
        });
      }
    }
  }

  return gaps;
}

export function getThreatProfileOverlays(framework = 'nca_ecc') {
  return overlaysFor(framework);
}

export function getControlName_nca(controlId) { return getControlName(controlId, 'nca_ecc'); }
export function getControlName_iso(controlId) { return getControlName(controlId, 'iso27001'); }

export function getThreatProfileLabel(profile) {
  return THREAT_PROFILE_LABELS[profile] ?? profile;
}

export function getCategoryDisplayLabel(category) {
  return CATEGORY_DISPLAY_LABELS[category] ?? category;
}

export function getScenarioSummary(threatProfiles = []) {
  return threatProfiles.map(getThreatProfileLabel).join(', ');
}
