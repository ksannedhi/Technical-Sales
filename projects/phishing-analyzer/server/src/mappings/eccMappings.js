const CONTROL_LIBRARY = {
  'ECC-2-1-1': 'Email authentication controls (SPF, DKIM, DMARC)',
  'ECC-2-1-2': 'Brand impersonation protection',
  'ECC-2-1-3': 'Inbound email filtering and sandboxing',
  'ECC-2-3-1': 'Web content filtering and URL inspection',
  'ECC-2-3-2': 'Malicious URL and domain blocking',
  'ECC-1-5-1': 'MFA enforcement',
  'ECC-1-5-3': 'Privileged credential protection',
  'ECC-3-3-1': 'Security awareness training',
  'ECC-3-3-2': 'Incident reporting procedures'
};

const CATEGORY_BASELINE = {
  sender: ['ECC-2-1-1', 'ECC-2-1-3'],
  headers: ['ECC-2-1-1', 'ECC-2-1-3'],
  links: ['ECC-2-3-1', 'ECC-2-3-2'],
  credential_harvesting: ['ECC-1-5-1', 'ECC-1-5-3'],
  impersonation: ['ECC-2-1-2', 'ECC-3-3-1'],
  urgency: ['ECC-3-3-1', 'ECC-3-3-2'],
  financial_fraud: ['ECC-3-3-1', 'ECC-3-3-2'],
  payload: ['ECC-2-1-3', 'ECC-2-3-2'],
  content: ['ECC-3-3-1', 'ECC-3-3-2']
};

const THREAT_PROFILE_OVERLAYS = {
  phishing: ['ECC-2-1-1', 'ECC-2-1-3', 'ECC-2-3-1', 'ECC-2-3-2', 'ECC-3-3-1', 'ECC-3-3-2'],
  business_email_compromise: ['ECC-2-1-1', 'ECC-2-1-2', 'ECC-2-1-3', 'ECC-1-5-1', 'ECC-3-3-1', 'ECC-3-3-2'],
  malware_delivery: ['ECC-2-1-3', 'ECC-2-3-1', 'ECC-2-3-2', 'ECC-3-3-1', 'ECC-3-3-2'],
  credential_harvesting: ['ECC-2-1-1', 'ECC-2-1-3', 'ECC-2-3-1', 'ECC-2-3-2', 'ECC-1-5-1', 'ECC-1-5-3', 'ECC-3-3-1'],
  impersonation: ['ECC-2-1-1', 'ECC-2-1-2', 'ECC-2-1-3', 'ECC-3-3-1', 'ECC-3-3-2'],
  financial_fraud: ['ECC-2-1-1', 'ECC-2-1-2', 'ECC-2-1-3', 'ECC-3-3-1', 'ECC-3-3-2'],
  invoice_fraud: ['ECC-2-1-1', 'ECC-2-1-2', 'ECC-2-1-3', 'ECC-1-5-1', 'ECC-3-3-1', 'ECC-3-3-2']
};

const THREAT_PROFILE_LABELS = {
  phishing: 'Phishing',
  business_email_compromise: 'Business Email Compromise',
  malware_delivery: 'Malware Delivery',
  credential_harvesting: 'Credential Harvesting',
  impersonation: 'Impersonation',
  financial_fraud: 'Financial Fraud',
  invoice_fraud: 'Invoice Fraud'
};

const CATEGORY_DISPLAY_LABELS = {
  sender: 'Sender spoofing',
  headers: 'Header mismatch',
  links: 'Malicious link',
  urgency: 'Urgency / social engineering',
  impersonation: 'Impersonation',
  payload: 'Malicious payload',
  content: 'Suspicious content',
  financial_fraud: 'Financial fraud / BEC',
  credential_harvesting: 'Credential harvesting'
};

export function getEccControlsForCategory(category) {
  return CATEGORY_BASELINE[category] ?? [];
}

export function getEccControlsForFinding(category, threatProfiles = []) {
  const controls = new Set(getEccControlsForCategory(category));

  threatProfiles.forEach((profile) => {
    for (const controlId of THREAT_PROFILE_OVERLAYS[profile] ?? []) {
      controls.add(controlId);
    }
  });

  return [...controls];
}

export function getControlName(controlId) {
  return CONTROL_LIBRARY[controlId] ?? controlId;
}

export function getThreatProfileLabel(profile) {
  return THREAT_PROFILE_LABELS[profile] ?? profile;
}

export function getCategoryDisplayLabel(category) {
  return CATEGORY_DISPLAY_LABELS[category] ?? category;
}

export function getScenarioSummary(threatProfiles = []) {
  return threatProfiles.map(getThreatProfileLabel).join(', ');
}

export function getThreatProfileOverlays() {
  return THREAT_PROFILE_OVERLAYS;
}
