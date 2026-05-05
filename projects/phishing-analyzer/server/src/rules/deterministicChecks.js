import { getCategoryDisplayLabel, getControlsForFinding } from '../mappings/eccMappings.js';
import { getDomainAgeDays } from '../services/domainAge.js';

const URGENCY_TERMS = [
  // English
  'urgent', 'immediately', 'within 24 hours', 'account suspended', 'failure to act',
  // German
  'sofort', 'dringend', 'unverzüglich', 'keine zeit verlieren', 'verlieren sie keine zeit',
  'konto gesperrt', 'ihre daten aktualisieren',
  // French
  'immédiatement', 'urgent', 'compte suspendu', 'sans délai',
  // Arabic
  'عاجل', 'فوراً', 'تعليق الحساب'
];
const BRAND_KEYWORDS = ['microsoft', 'office 365', 'outlook', 'bank', 'invoice', 'payroll', 'amazon', 'jeff bezos'];
const FREE_MAIL = ['gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com'];
const OFFICIAL_BRAND_DOMAINS = ['microsoft.com', 'live.com', 'outlook.com', 'amazon.com', 'apple.com', 'google.com', 'paypal.com'];

// Brand terms mapped to their authoritative domains for link-text vs href mismatch
const BRAND_DOMAIN_MAP = [
  { terms: ['microsoft', 'office 365', 'microsoft account', 'outlook'], domain: 'microsoft.com', alts: ['live.com', 'microsoftonline.com'] },
  { terms: ['amazon'], domain: 'amazon.com', alts: [] },
  { terms: ['paypal'], domain: 'paypal.com', alts: [] },
  { terms: ['apple', 'icloud', 'apple id'], domain: 'apple.com', alts: [] },
  { terms: ['google', 'gmail'], domain: 'google.com', alts: ['accounts.google.com'] },
  { terms: ['linkedin'], domain: 'linkedin.com', alts: [] },
  { terms: ['facebook', 'meta'], domain: 'facebook.com', alts: ['meta.com'] },
  { terms: ['dropbox'], domain: 'dropbox.com', alts: [] },
  { terms: ['docusign'], domain: 'docusign.com', alts: [] }
];

function isBrandDomainMismatch(fromDomain, combinedText) {
  const lowered = combinedText.toLowerCase();
  if (!fromDomain || OFFICIAL_BRAND_DOMAINS.some((d) => fromDomain.endsWith(d))) {
    return false;
  }
  if (lowered.includes('microsoft') || lowered.includes('office 365') || lowered.includes('microsoft account')) {
    return !fromDomain.endsWith('microsoft.com') && !fromDomain.endsWith('live.com');
  }
  if (lowered.includes('amazon') && !lowered.includes('jeff bezos')) {
    return !fromDomain.endsWith('amazon.com');
  }
  if (lowered.includes('paypal')) {
    return !fromDomain.endsWith('paypal.com');
  }
  if (lowered.includes('apple') || lowered.includes('icloud') || lowered.includes('apple id')) {
    return !fromDomain.endsWith('apple.com');
  }
  return false;
}

// Returns {brand, officialDomain} if link text claims a brand but href goes elsewhere.
function detectLinkTextBrandMismatch(linkPairs = []) {
  for (const { href, text } of linkPairs) {
    const textLower = text.toLowerCase();
    for (const mapping of BRAND_DOMAIN_MAP) {
      if (!mapping.terms.some((t) => textLower.includes(t))) continue;
      try {
        const host = new URL(href).hostname.toLowerCase();
        const isOfficial =
          host.endsWith(mapping.domain) ||
          mapping.alts.some((alt) => host.endsWith(alt));
        if (!isOfficial) {
          return { brand: mapping.terms[0], officialDomain: mapping.domain, actualHost: host, text, href };
        }
      } catch {
        // malformed URL — skip
      }
    }
  }
  return null;
}

const PRIZE_FRAUD_TERMS = [
  // English
  'won you', 'you have won', 'lottery', 'donation', 'beneficiary', 'prize',
  '$2,500,000', '$2.500,000.00',
  // German
  'gewinnspiel', 'gewinner', 'herzlichen glückwunsch', 'herzlichen gluckwunsch',
  'finalisten', 'gewinndaten', 'gewinn', 'gutschein gewinn',
  // French
  'vous avez gagné', 'tirage au sort', 'loterie', 'gagnant',
  // Arabic
  'لقد فزت', 'يانصيب', 'جائزة'
];
const REPLY_LURE_TERMS = ['kindly get back to me', 'reply to this email', 'confirm your email address', 'so i know your email address is valid'];
const HIGH_PROFILE_IMPERSONATION_TERMS = ['jeff bezos', 'amazon founder', 'ceo of amazon', 'mr. jeffrey bezos'];
const TRACKING_DOMAINS = ['sendgrid.net', 'cloudfront.net', 'mailchimp.com', 'mandrillapp.com', 'hubspotemail.net'];
const IMAGE_HOSTS = ['imgur.com', 'giphy.com'];
const BENIGN_ASSET_DOMAINS = ['googleapis.com', 'gstatic.com', 'googleusercontent.com'];
// URL path prefixes used by email signature image and link targets across vendors
const SIGNATURE_URL_PATTERNS = ['/sig_', '/signature/', '/email-signature/', '/sig/', '/emailsig/'];
const NEWSLETTER_TERMS = ['unsubscribe', 'manage preferences', 'view in browser', 'newsletter', 'email preferences', 'opt out'];

function domainFromAddress(value) {
  const match = value.match(/@([^>\s]+)/);
  return match?.[1]?.toLowerCase() ?? '';
}

function hostFromUrl(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname.includes('=') ? '' : hostname;
  } catch {
    return '';
  }
}

function pathFromUrl(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return '';
  }
}

function rootDomain(value) {
  if (!value) return '';
  const cleaned = value.toLowerCase().replace(/^.*@/, '').replace(/[>\]]/g, '');
  const parts = cleaned.split('.').filter(Boolean);
  if (parts.length <= 2) return cleaned;
  return parts.slice(-2).join('.');
}

function authSignals(headers) {
  const authText = `${headers.authenticationResults || ''} ${headers.receivedSpf || ''}`.toLowerCase();
  return {
    spfPass: authText.includes('spf=pass') || authText.includes('received-spf: pass') || authText.includes(' pass '),
    spfFail: authText.includes('spf=fail'),
    spfNone: authText.includes('spf=none'),
    dkimPass: authText.includes('dkim=pass'),
    dkimFail: authText.includes('dkim=fail'),
    dkimNone: authText.includes('dkim=none'),
    dmarcPass: authText.includes('dmarc=pass'),
    dmarcFail: authText.includes('dmarc=fail'),
    dmarcWeakened: authText.includes('dmarc=permerror') || authText.includes('dmarc=temperror') || authText.includes('dmarc=none')
  };
}

function isLikelyLegitimateTrackingUrl(urlHost, senderRoot, returnPathRoot, urlPath) {
  if (!urlHost) return false;
  if (TRACKING_DOMAINS.some((d) => urlHost.endsWith(d))) return true;
  if (IMAGE_HOSTS.some((d) => urlHost.endsWith(d))) return true;
  if (BENIGN_ASSET_DOMAINS.some((d) => urlHost.endsWith(d))) return true;
  if (senderRoot && urlHost.endsWith(senderRoot)) return true;
  if (returnPathRoot && urlHost.endsWith(returnPathRoot)) return true;
  // Email signature image/link targets (e.g. goto.vendor.com/sig_logo)
  if (urlPath && SIGNATURE_URL_PATTERNS.some((p) => urlPath.toLowerCase().startsWith(p))) return true;
  return false;
}

function hasTyposquatting(domain) {
  if (!domain) return false;
  // ASCII character substitution (e.g. micros0ft, paypa1)
  if (/micros0ft|rnicrosoft|paypa1|0utlook|g00gle/i.test(domain)) return true;
  // Non-ASCII / homograph characters
  if (/[^\x00-\x7F]/.test(domain)) return true;
  // Punycode-encoded IDN (xn-- prefix signals encoded non-ASCII)
  if (domain.split('.').some((label) => label.startsWith('xn--'))) return true;
  return false;
}

function detectThreatProfiles({ combinedText, parsedEmail, fromDomain, replyToDomain, returnPathDomain, auth }) {
  const threatProfiles = new Set();
  const lowered = combinedText.toLowerCase();
  const suspiciousEmailLanguage =
    /urgent|verify|login|password|sign in|account suspended|click|won you|lottery|donation|beneficiary|invoice|wire transfer|bank account|payroll/i.test(lowered);
  const suspiciousInfrastructure =
    hasTyposquatting(fromDomain) ||
    (replyToDomain && fromDomain && rootDomain(replyToDomain) !== rootDomain(fromDomain)) ||
    (returnPathDomain && fromDomain && rootDomain(returnPathDomain) !== rootDomain(fromDomain)) ||
    parsedEmail.attachmentDetected;
  const newsletterLike = NEWSLETTER_TERMS.some((term) => lowered.includes(term));
  const strongAuth = auth.spfPass && auth.dkimPass && auth.dmarcPass;

  if ((suspiciousEmailLanguage || suspiciousInfrastructure) && !(newsletterLike && strongAuth && !suspiciousInfrastructure)) {
    threatProfiles.add('phishing');
  }

  if (/verify|password|login|sign in|credential|mfa/i.test(lowered) && parsedEmail.urls.length > 0) {
    threatProfiles.add('credential_harvesting');
  }

  if (/invoice|payment|wire transfer|bank account|payroll|remittance/i.test(lowered)) {
    threatProfiles.add('invoice_fraud');
    threatProfiles.add('business_email_compromise');
  }

  if (PRIZE_FRAUD_TERMS.some((term) => lowered.includes(term))) {
    threatProfiles.add('financial_fraud');
    threatProfiles.add('impersonation');
  }

  // Require actual attachment detection OR explicit payload language.
  // Bare "attached"/"attachment" removed — too common in legitimate business prose.
  if (parsedEmail.attachmentDetected || /enable content|macro|zip file|html attachment|open the file/i.test(lowered)) {
    threatProfiles.add('malware_delivery');
  }

  if (
    hasTyposquatting(fromDomain) ||
    (replyToDomain && fromDomain && rootDomain(replyToDomain) !== rootDomain(fromDomain)) ||
    (returnPathDomain && fromDomain && rootDomain(returnPathDomain) !== rootDomain(fromDomain))
  ) {
    threatProfiles.add('impersonation');
  }

  if (
    HIGH_PROFILE_IMPERSONATION_TERMS.some((term) => lowered.includes(term)) ||
    (BRAND_KEYWORDS.some((term) => lowered.includes(term)) && fromDomain && FREE_MAIL.includes(fromDomain)) ||
    isBrandDomainMismatch(fromDomain, combinedText)
  ) {
    threatProfiles.add('impersonation');
  }

  return [...threatProfiles];
}

function addFinding(findings, threatProfiles, finding) {
  findings.push({
    ...finding,
    displayCategory: getCategoryDisplayLabel(finding.category),
    eccControls: getControlsForFinding(finding.category, threatProfiles, 'nca_ecc'),
    isoControls: getControlsForFinding(finding.category, threatProfiles, 'iso27001')
  });
}

export async function runDeterministicChecks(parsedEmail) {
  const findings = [];
  const fromDomain = domainFromAddress(parsedEmail.headers.from);
  const replyToDomain = domainFromAddress(parsedEmail.headers.replyTo);
  const returnPathDomain = domainFromAddress(parsedEmail.headers.returnPath);
  const fromRoot = rootDomain(fromDomain);
  const replyToRoot = rootDomain(replyToDomain);
  const returnPathRoot = rootDomain(returnPathDomain);
  const auth = authSignals(parsedEmail.headers);
  const subject = parsedEmail.headers.subject || '';
  const body = parsedEmail.body || '';
  const combinedText = `${subject}\n${body}`;
  const threatProfiles = detectThreatProfiles({ combinedText, parsedEmail, fromDomain, replyToDomain, returnPathDomain, auth });

  // --- Sender checks ---

  if (fromDomain && hasTyposquatting(fromDomain)) {
    addFinding(findings, threatProfiles, {
      id: 'sender-typosquat',
      category: 'sender',
      severity: 'critical',
      title: 'Typosquatted sender domain detected',
      detail: `The sender domain ${fromDomain} resembles a trusted brand but contains lookalike or non-ASCII characters designed to deceive the recipient.`,
      excerpt: parsedEmail.headers.from,
      deterministic: true,
      eccExplanation: 'Sender authentication and inbound filtering controls should block spoofed or lookalike domains before delivery.'
    });
  }

  // Domain age check (async, non-blocking on failure)
  const ageDays = await getDomainAgeDays(fromDomain).catch(() => null);
  if (ageDays !== null && ageDays < 30) {
    addFinding(findings, threatProfiles, {
      id: 'sender-domain-recently-registered',
      category: 'sender',
      severity: 'high',
      title: 'Sender domain registered recently',
      detail: `The sender domain (${fromDomain}) was registered approximately ${ageDays} day${ageDays === 1 ? '' : 's'} ago. Newly created domains are a strong indicator of purpose-built phishing infrastructure.`,
      excerpt: parsedEmail.headers.from,
      deterministic: true,
      eccExplanation: 'Email authentication and sender reputation controls should treat newly registered domains as high-risk senders and apply additional scrutiny or quarantine.'
    });
  }

  // --- Header checks ---

  if (replyToDomain && fromDomain && replyToDomain !== fromDomain) {
    addFinding(findings, threatProfiles, {
      id: 'headers-replyto-mismatch',
      category: 'headers',
      severity: 'critical',
      title: 'Reply-To domain differs from sender domain',
      detail: 'The message routes responses to a different domain, which is a common credential-harvesting or redirection signal.',
      excerpt: `From: ${parsedEmail.headers.from}\nReply-To: ${parsedEmail.headers.replyTo}`,
      deterministic: true,
      eccExplanation: 'Email authentication and secure filtering should detect suspicious header mismatches before a user can respond.'
    });
  }

  if (returnPathDomain && fromDomain && rootDomain(returnPathDomain) !== rootDomain(fromDomain)) {
    addFinding(findings, threatProfiles, {
      id: 'headers-returnpath-mismatch',
      category: 'headers',
      severity: 'medium',
      title: 'Return-Path domain differs from sender domain',
      detail: `Bounce handling is routed to ${returnPathDomain}, which is unrelated to the claimed sender domain. This is a common signal of infrastructure deception where the sending party operates under a different domain than the one displayed.`,
      excerpt: `From: ${parsedEmail.headers.from}\nReturn-Path: ${parsedEmail.headers.returnPath}`,
      deterministic: true,
      eccExplanation: 'Email authentication controls should validate envelope sender alignment and flag messages where the return path diverges from the From domain.'
    });
  }

  if (
    auth.spfFail || auth.dkimFail || auth.dmarcFail || auth.dmarcWeakened ||
    (auth.spfNone && auth.dkimNone && !auth.spfPass)
  ) {
    const hardFail = auth.spfFail || auth.dkimFail || auth.dmarcFail;
    addFinding(findings, threatProfiles, {
      id: 'headers-authentication-failure',
      category: 'headers',
      severity: hardFail ? 'high' : 'medium',
      title: hardFail ? 'Email authentication failure detected' : 'Email authentication absent or misconfigured',
      detail: hardFail
        ? 'One or more sender-authentication signals failed, which increases the likelihood of spoofing or untrusted delivery infrastructure.'
        : 'SPF and DKIM are absent and DMARC is missing or misconfigured, meaning there is no verifiable proof the claimed sender domain authorised this message.',
      excerpt: `${parsedEmail.headers.authenticationResults || ''} ${parsedEmail.headers.receivedSpf || ''}`.trim(),
      deterministic: true,
      eccExplanation: 'Authentication failures are strong indicators that email protection controls should quarantine or flag the message for further review.'
    });
  }

  // --- Link checks ---

  if (parsedEmail.urls.length > 0) {
    const firstRiskyUrl = parsedEmail.urls.find((url) => {
      const host = hostFromUrl(url);
      if (!host) return false;
      return !isLikelyLegitimateTrackingUrl(host, fromRoot, returnPathRoot, pathFromUrl(url));
    });
    const urlDomain = firstRiskyUrl ? hostFromUrl(firstRiskyUrl) : '';
    if (urlDomain && fromRoot && rootDomain(urlDomain) !== fromRoot && rootDomain(urlDomain) !== returnPathRoot) {
      addFinding(findings, threatProfiles, {
        id: 'links-domain-mismatch',
        category: 'links',
        severity: 'high',
        title: 'Embedded URL domain does not match sender context',
        detail: 'The destination domain differs from the sender domain and appears designed to collect credentials or redirect the user off-brand.',
        excerpt: firstRiskyUrl,
        deterministic: true,
        eccExplanation: 'URL filtering and domain blocking controls should inspect and stop access to suspicious destinations.'
      });
    }
  }

  // Link text vs. href brand mismatch
  const linkMismatch = detectLinkTextBrandMismatch(parsedEmail.linkPairs || []);
  if (linkMismatch) {
    addFinding(findings, threatProfiles, {
      id: 'links-text-href-mismatch',
      category: 'links',
      severity: 'high',
      title: 'Link text claims a trusted brand but destination is unrelated',
      detail: `Anchor text references "${linkMismatch.brand}" (official domain: ${linkMismatch.officialDomain}) but the actual destination is ${linkMismatch.actualHost}. This is a classic visual deception technique used to redirect users to attacker-controlled pages.`,
      excerpt: `Text: "${linkMismatch.text}" → ${linkMismatch.href}`,
      deterministic: true,
      eccExplanation: 'URL filtering controls should evaluate the actual destination domain, not the display text. User training should reinforce hovering over links before clicking.'
    });
  }

  // --- Content and urgency checks ---

  if (URGENCY_TERMS.some((term) => combinedText.toLowerCase().includes(term))) {
    addFinding(findings, threatProfiles, {
      id: 'urgency-pressure-language',
      category: 'urgency',
      severity: 'high',
      title: 'Urgency language used to force immediate action',
      detail: 'The message applies time pressure to suppress verification and speed up user response.',
      excerpt: body.split('\n').find((line) => URGENCY_TERMS.some((term) => line.toLowerCase().includes(term))) || subject,
      deterministic: true,
      eccExplanation: 'Awareness and reporting controls should help users recognize coercive language and escalate it quickly.'
    });
  }

  const brandFromFreeMail = BRAND_KEYWORDS.some((term) => combinedText.toLowerCase().includes(term)) && fromDomain && FREE_MAIL.includes(fromDomain);
  const brandFromLookalikeDomain = isBrandDomainMismatch(fromDomain, combinedText);
  if (brandFromFreeMail || brandFromLookalikeDomain) {
    addFinding(findings, threatProfiles, {
      id: 'impersonation-brand-abuse',
      category: 'impersonation',
      severity: brandFromLookalikeDomain ? 'high' : 'medium',
      title: brandFromLookalikeDomain
        ? 'Brand impersonation from a lookalike sender domain'
        : 'Brand-referencing content from a non-official mail domain',
      detail: brandFromLookalikeDomain
        ? `The message claims to be from a trusted brand but the sender domain (${fromDomain}) is not an official domain for that organisation. This pattern is consistent with purpose-built phishing infrastructure.`
        : 'The message references a trusted organization but does not originate from an official domain associated with that brand.',
      excerpt: parsedEmail.headers.from || subject,
      deterministic: true,
      eccExplanation: 'Brand impersonation controls and user education should reduce trust in off-brand messaging.'
    });
  }

  if (/verify|password|login|sign[- .]in|credential|mfa/i.test(combinedText) && parsedEmail.urls.length > 0) {
    addFinding(findings, threatProfiles, {
      id: 'credential-harvesting-lure',
      category: 'credential_harvesting',
      severity: 'high',
      title: 'Credential-harvesting language detected',
      detail: 'The message combines account-verification language with a clickable link, which is consistent with credential theft campaigns.',
      excerpt: subject,
      deterministic: true,
      eccExplanation: 'MFA and privileged credential protections help reduce the impact of stolen credentials, even if a user clicks.'
    });
  }

  if (/invoice|payment|wire transfer|bank account|payroll/i.test(combinedText)) {
    addFinding(findings, threatProfiles, {
      id: 'financial-fraud-cue',
      category: 'financial_fraud',
      severity: 'medium',
      title: 'Potential financial fraud language detected',
      detail: 'The message includes financial-pressure language associated with invoice fraud or BEC-style social engineering.',
      excerpt: subject,
      deterministic: true,
      eccExplanation: 'Employee awareness and reporting processes are needed to interrupt socially engineered finance workflows.'
    });
  }

  if (HIGH_PROFILE_IMPERSONATION_TERMS.some((term) => combinedText.toLowerCase().includes(term))) {
    addFinding(findings, threatProfiles, {
      id: 'impersonation-high-profile',
      category: 'impersonation',
      severity: 'high',
      title: 'High-profile identity impersonation detected',
      detail: 'The sender claims to be a well-known executive or public figure while using an unrelated personal mailbox, which is a common scam pattern.',
      excerpt: parsedEmail.headers.from || subject,
      deterministic: true,
      eccExplanation: 'Brand and identity impersonation protections should reduce trust in messages abusing well-known names to manipulate recipients.'
    });
  }

  if (PRIZE_FRAUD_TERMS.some((term) => combinedText.toLowerCase().includes(term))) {
    addFinding(findings, threatProfiles, {
      id: 'financial-fraud-prize-theme',
      category: 'financial_fraud',
      severity: 'high',
      title: 'Advance-fee or prize-fraud language detected',
      detail: 'The email uses lottery, winnings, donation, or payout language associated with common advance-fee and scam campaigns.',
      excerpt: body.split('\n').find((line) => PRIZE_FRAUD_TERMS.some((term) => line.toLowerCase().includes(term))) || subject,
      deterministic: true,
      eccExplanation: 'Awareness and reporting controls help users identify non-technical fraud lures that still result in compromise, extortion, or data exposure.'
    });
  }

  if (REPLY_LURE_TERMS.some((term) => combinedText.toLowerCase().includes(term))) {
    addFinding(findings, threatProfiles, {
      id: 'content-reply-lure',
      category: 'content',
      severity: 'medium',
      title: 'Reply-based social engineering lure detected',
      detail: 'The sender asks the recipient to reply and validate their email address, which is a common first step in scam progression and victim qualification.',
      excerpt: body.split('\n').find((line) => REPLY_LURE_TERMS.some((term) => line.toLowerCase().includes(term))) || body.slice(0, 180),
      deterministic: true,
      eccExplanation: 'User awareness and suspicious-message reporting are important even when the scam relies on replies rather than links or attachments.'
    });
  }

  if (parsedEmail.cssObfuscationDetected) {
    addFinding(findings, threatProfiles, {
      id: 'content-css-obfuscation',
      category: 'content',
      severity: 'medium',
      title: 'CSS content obfuscation detected',
      detail: 'The email contains an oversized CSS style block with a large number of comma-separated selectors. This pattern is used to hide malicious intent from spam filters and content-inspection gateways.',
      excerpt: '<style> block with excessive comma-separated selectors detected in email body',
      deterministic: true,
      eccExplanation: 'Email security controls should inspect and flag obfuscated or oversized style payloads used to evade gateway analysis.'
    });
  }

  // --- IOC extraction ---
  const suspiciousUrls = parsedEmail.urls.filter((url) => {
    const host = hostFromUrl(url);
    return host && !isLikelyLegitimateTrackingUrl(host, fromRoot, returnPathRoot, pathFromUrl(url));
  });

  const allDomains = [
    fromDomain,
    replyToDomain,
    returnPathDomain,
    ...parsedEmail.urls.map((u) => hostFromUrl(u)).filter(Boolean)
  ].filter(Boolean);

  const iocs = {
    senderDomains: fromDomain ? [fromDomain] : [],
    replyToDomains: replyToDomain ? [replyToDomain] : [],
    returnPathDomains: returnPathDomain ? [returnPathDomain] : [],
    embeddedUrls: [...new Set(suspiciousUrls)],
    uniqueDomains: [...new Set(allDomains)]
  };

  return {
    findings,
    summary: {
      fromDomain,
      returnPathDomain,
      replyToDomain,
      urlCount: parsedEmail.urls.length,
      attachmentDetected: parsedEmail.attachmentDetected,
      threatProfiles,
      auth,
      iocs
    }
  };
}
