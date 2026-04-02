import { getCategoryDisplayLabel, getEccControlsForFinding } from '../mappings/eccMappings.js';

const URGENCY_TERMS = ['urgent', 'immediately', 'within 24 hours', 'account suspended', 'failure to act'];
const BRAND_KEYWORDS = ['microsoft', 'office 365', 'outlook', 'bank', 'invoice', 'payroll', 'amazon', 'jeff bezos'];
const FREE_MAIL = ['gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com'];
const PRIZE_FRAUD_TERMS = [
  'won you',
  'you have won',
  'lottery',
  'donation',
  'beneficiary',
  'prize',
  '$2,500,000',
  '$2.500,000.00'
];
const REPLY_LURE_TERMS = ['kindly get back to me', 'reply to this email', 'confirm your email address', 'so i know your email address is valid'];
const HIGH_PROFILE_IMPERSONATION_TERMS = ['jeff bezos', 'amazon founder', 'ceo of amazon', 'mr. jeffrey bezos'];
const TRACKING_DOMAINS = ['sendgrid.net', 'cloudfront.net', 'mailchimp.com', 'mandrillapp.com', 'hubspotemail.net'];
const IMAGE_HOSTS = ['imgur.com', 'giphy.com'];
const BENIGN_ASSET_DOMAINS = ['googleapis.com', 'gstatic.com', 'googleusercontent.com'];
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

function rootDomain(value) {
  if (!value) {
    return '';
  }

  const cleaned = value.toLowerCase().replace(/^.*@/, '').replace(/[>\]]/g, '');
  const parts = cleaned.split('.').filter(Boolean);
  if (parts.length <= 2) {
    return cleaned;
  }

  return parts.slice(-2).join('.');
}

function authSignals(headers) {
  const authText = `${headers.authenticationResults || ''} ${headers.receivedSpf || ''}`.toLowerCase();
  return {
    spfPass: authText.includes('spf=pass') || authText.includes('received-spf: pass') || authText.includes(' pass '),
    spfFail: authText.includes('spf=fail'),
    dkimPass: authText.includes('dkim=pass'),
    dkimFail: authText.includes('dkim=fail'),
    dmarcPass: authText.includes('dmarc=pass'),
    dmarcFail: authText.includes('dmarc=fail')
  };
}

function isLikelyLegitimateTrackingUrl(urlHost, senderRoot, returnPathRoot) {
  if (!urlHost) {
    return false;
  }

  if (TRACKING_DOMAINS.some((domain) => urlHost.endsWith(domain))) {
    return true;
  }

  if (IMAGE_HOSTS.some((domain) => urlHost.endsWith(domain))) {
    return true;
  }

  if (BENIGN_ASSET_DOMAINS.some((domain) => urlHost.endsWith(domain))) {
    return true;
  }

  if (senderRoot && urlHost.endsWith(senderRoot)) {
    return true;
  }

  if (returnPathRoot && urlHost.endsWith(returnPathRoot)) {
    return true;
  }

  return false;
}

function hasTyposquatting(domain) {
  return /micros0ft|rnicrosoft|paypa1|0utlook|g00gle/i.test(domain);
}

function detectThreatProfiles({ combinedText, parsedEmail, fromDomain, replyToDomain, auth }) {
  const threatProfiles = new Set();
  const lowered = combinedText.toLowerCase();
  const suspiciousEmailLanguage =
    /urgent|verify|login|password|sign in|account suspended|click|won you|lottery|donation|beneficiary|invoice|wire transfer|bank account|payroll/i.test(
      lowered
    );
  const suspiciousInfrastructure =
    hasTyposquatting(fromDomain) ||
    (replyToDomain && fromDomain && rootDomain(replyToDomain) !== rootDomain(fromDomain)) ||
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

  if (
    parsedEmail.attachmentDetected ||
    /attached|attachment|enable content|macro|zip file|html attachment|open the file/i.test(lowered)
  ) {
    threatProfiles.add('malware_delivery');
  }

  if (hasTyposquatting(fromDomain) || (replyToDomain && fromDomain && rootDomain(replyToDomain) !== rootDomain(fromDomain))) {
    threatProfiles.add('impersonation');
  }

  if (
    HIGH_PROFILE_IMPERSONATION_TERMS.some((term) => lowered.includes(term)) ||
    (BRAND_KEYWORDS.some((term) => lowered.includes(term)) && fromDomain && FREE_MAIL.includes(fromDomain))
  ) {
    threatProfiles.add('impersonation');
  }

  return [...threatProfiles];
}

function addFinding(findings, threatProfiles, finding) {
  findings.push({
    ...finding,
    displayCategory: getCategoryDisplayLabel(finding.category),
    eccControls: getEccControlsForFinding(finding.category, threatProfiles)
  });
}

export function runDeterministicChecks(parsedEmail) {
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
  const threatProfiles = detectThreatProfiles({ combinedText, parsedEmail, fromDomain, replyToDomain, auth });

  if (fromDomain && hasTyposquatting(fromDomain)) {
    addFinding(findings, threatProfiles, {
      id: 'sender-typosquat',
      category: 'sender',
      severity: 'critical',
      title: 'Typosquatted sender domain detected',
      detail: `The sender domain ${fromDomain} resembles a trusted brand but contains lookalike characters.`,
      excerpt: parsedEmail.headers.from,
      deterministic: true,
      eccExplanation: 'Sender authentication and inbound filtering controls should block spoofed or lookalike domains before delivery.'
    });
  }

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

  if (auth.spfFail || auth.dkimFail || auth.dmarcFail) {
    addFinding(findings, threatProfiles, {
      id: 'headers-authentication-failure',
      category: 'headers',
      severity: 'high',
      title: 'Email authentication failure detected',
      detail: 'One or more sender-authentication signals failed, which increases the likelihood of spoofing or untrusted delivery infrastructure.',
      excerpt: `${parsedEmail.headers.authenticationResults || ''} ${parsedEmail.headers.receivedSpf || ''}`.trim(),
      deterministic: true,
      eccExplanation: 'Authentication failures are strong indicators that email protection controls should quarantine or flag the message for further review.'
    });
  }

  if (parsedEmail.urls.length > 0) {
    const firstRiskyUrl = parsedEmail.urls.find((url) => {
      const host = hostFromUrl(url);
      if (!host) {
        return false;
      }
      return !isLikelyLegitimateTrackingUrl(host, fromRoot, returnPathRoot);
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

  if (BRAND_KEYWORDS.some((term) => combinedText.toLowerCase().includes(term)) && fromDomain && FREE_MAIL.includes(fromDomain)) {
    addFinding(findings, threatProfiles, {
      id: 'impersonation-brand-abuse',
      category: 'impersonation',
      severity: 'medium',
      title: 'Brand-referencing content from a non-official mail domain',
      detail: 'The message references a trusted organization but does not originate from an official domain associated with that brand.',
      excerpt: parsedEmail.headers.from || subject,
      deterministic: true,
      eccExplanation: 'Brand impersonation controls and user education should reduce trust in off-brand messaging.'
    });
  }

  if (/verify|password|login|sign in|credential|mfa/i.test(combinedText) && parsedEmail.urls.length > 0) {
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
      excerpt:
        body.split('\n').find((line) => PRIZE_FRAUD_TERMS.some((term) => line.toLowerCase().includes(term))) || subject,
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
      excerpt:
        body.split('\n').find((line) => REPLY_LURE_TERMS.some((term) => line.toLowerCase().includes(term))) || body.slice(0, 180),
      deterministic: true,
      eccExplanation: 'User awareness and suspicious-message reporting are important even when the scam relies on replies rather than links or attachments.'
    });
  }

  return {
    findings,
    summary: {
      fromDomain,
      returnPathDomain,
      replyToDomain,
      urlCount: parsedEmail.urls.length,
      attachmentDetected: parsedEmail.attachmentDetected,
      threatProfiles,
      auth
    }
  };
}
