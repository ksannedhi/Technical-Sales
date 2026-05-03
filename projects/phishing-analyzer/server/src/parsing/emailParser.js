function parseHeaders(raw) {
  const headerBlock = raw.split(/\r?\n\r?\n/, 1)[0] || raw;
  const headers = new Map();
  let currentName = '';
  let currentValue = '';

  for (const line of headerBlock.split(/\r?\n/)) {
    if (/^[ \t]+/.test(line) && currentName) {
      currentValue += ` ${line.trim()}`;
      continue;
    }

    if (currentName) {
      headers.set(currentName.toLowerCase(), currentValue.trim());
    }

    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) {
      currentName = '';
      currentValue = '';
      continue;
    }

    currentName = line.slice(0, separatorIndex);
    currentValue = line.slice(separatorIndex + 1).trim();
  }

  if (currentName) {
    headers.set(currentName.toLowerCase(), currentValue.trim());
  }

  return headers;
}

function readHeader(headers, headerName) {
  return headers.get(headerName.toLowerCase()) ?? '';
}

function extractBody(raw) {
  const split = raw.split(/\r?\n\r?\n/);
  return split.length > 1 ? split.slice(1).join('\n\n').trim() : raw.trim();
}

function extractUrls(text) {
  return [...text.matchAll(/https?:\/\/[^\s)>"'<\]]+/gim)].map((m) => m[0]);
}

function detectAttachment(raw) {
  const attachmentDisposition = /^content-disposition:\s*attachment\b.*$/gim;
  const namedAttachmentHeader =
    /^(content-disposition|content-type):.*\b(filename|name)\s*=\s*"?[^"\r\n;]+\.(zip|iso|pdf|html?|docx?|xlsx?|xls|pptx?|exe|js|img)\b.*$/gim;

  return attachmentDisposition.test(raw) || namedAttachmentHeader.test(raw);
}

function detectCssObfuscation(raw) {
  const styleBlocks = [...raw.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)];
  for (const block of styleBlocks) {
    const commaCount = (block[1].match(/,/g) || []).length;
    if (commaCount >= 100) {
      return true;
    }
  }
  return false;
}

function decodeQuotedPrintable(str) {
  return str
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function parseMimePart(partRaw) {
  const crlfIdx = partRaw.indexOf('\r\n\r\n');
  const lfIdx = partRaw.indexOf('\n\n');
  const sepIdx = crlfIdx !== -1 ? crlfIdx : lfIdx;
  if (sepIdx === -1) return { headers: new Map(), body: partRaw };

  const isCrlf = crlfIdx !== -1 && (lfIdx === -1 || crlfIdx <= lfIdx);
  const headerText = partRaw.slice(0, sepIdx);
  const body = partRaw.slice(sepIdx + (isCrlf ? 4 : 2));

  const headers = new Map();
  let currentKey = '';
  let currentVal = '';
  for (const line of headerText.split(/\r?\n/)) {
    if (/^[ \t]/.test(line) && currentKey) {
      currentVal += ` ${line.trim()}`;
      continue;
    }
    if (currentKey) headers.set(currentKey, currentVal.trim());
    const colon = line.indexOf(':');
    if (colon !== -1) {
      currentKey = line.slice(0, colon).trim().toLowerCase();
      currentVal = line.slice(colon + 1).trim();
    } else {
      currentKey = '';
      currentVal = '';
    }
  }
  if (currentKey) headers.set(currentKey, currentVal.trim());

  return { headers, body };
}

// Returns { plain, html } decoded from MIME multipart, or null if not multipart.
function decodeMimeBody(raw) {
  const headerBlock = raw.split(/\r?\n\r?\n/)[0] || '';
  const rawContentType = headerBlock
    .split(/\r?\n/)
    .reduce((acc, line) => {
      if (/^content-type:/i.test(line)) return line.slice(line.indexOf(':') + 1).trim();
      if (acc && /^[ \t]/.test(line)) return acc + ' ' + line.trim();
      return acc;
    }, '');

  const boundaryMatch = rawContentType.match(/boundary=["']?([^"';\s]+)["']?/i);
  if (!boundaryMatch) return null;

  const boundary = boundaryMatch[1];
  const escaped = boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const bodyStart = raw.search(/\r?\n\r?\n/);
  if (bodyStart === -1) return null;

  const bodySection = raw.slice(bodyStart);
  const parts = bodySection.split(new RegExp(`--${escaped}(?:--)?`));

  let plain = '';
  let html = '';

  for (const part of parts) {
    const trimmed = part.replace(/^\r?\n/, '');
    if (!trimmed.trim() || trimmed.trim() === '--') continue;

    const { headers, body } = parseMimePart(trimmed);
    const ct = (headers.get('content-type') || '').toLowerCase();
    const enc = (headers.get('content-transfer-encoding') || '').toLowerCase().trim();

    let decoded = body;
    if (enc === 'base64') {
      try {
        decoded = Buffer.from(body.replace(/\s+/g, ''), 'base64').toString('utf-8');
      } catch {
        decoded = body;
      }
    } else if (enc === 'quoted-printable') {
      decoded = decodeQuotedPrintable(body);
    }

    if (ct.startsWith('text/html')) {
      html += decoded;
    } else if (ct.startsWith('text/plain')) {
      plain += decoded;
    } else if (ct.includes('multipart/')) {
      const subHeaderLines = [...headers.entries()].map(([k, v]) => `${k}: ${v}`).join('\r\n');
      const subRaw = `${subHeaderLines}\r\n\r\n${body}`;
      const nested = decodeMimeBody(subRaw);
      if (nested) {
        plain += nested.plain;
        html += nested.html;
      }
    }
  }

  return { plain, html };
}

// Extract {href, text} pairs from HTML anchor elements.
function extractLinkPairs(html) {
  const pairs = [];
  const re = /<a[^>]+href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const href = m[1].trim();
    const text = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (href.startsWith('http') && text.length > 0) {
      pairs.push({ href, text });
    }
  }
  return pairs;
}

export function parseEmailInput(raw, inputType = 'raw_text') {
  const parsedHeaders = parseHeaders(raw);
  const from = readHeader(parsedHeaders, 'From');
  const replyTo = readHeader(parsedHeaders, 'Reply-To');
  const subject = readHeader(parsedHeaders, 'Subject');
  const returnPath = readHeader(parsedHeaders, 'Return-Path');
  const authenticationResults = readHeader(parsedHeaders, 'Authentication-Results');
  const receivedSpf = readHeader(parsedHeaders, 'Received-SPF');

  // Attempt MIME multipart decoding; fall back to raw body split
  const mimeDecoded = decodeMimeBody(raw);
  const decodedHtml = mimeDecoded?.html || '';
  const decodedPlain = mimeDecoded?.plain || '';
  const rawBody = extractBody(raw);

  // Prefer MIME-decoded plain text; derive from HTML if unavailable; fall back to raw
  const body = decodedPlain ||
    (decodedHtml ? decodedHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '') ||
    rawBody;

  // Collect URLs from all available sources and deduplicate
  const urlsFromRaw = extractUrls(raw);
  const urlsFromDecoded = decodedHtml ? extractUrls(decodedHtml) : [];
  const urls = [...new Set([...urlsFromRaw, ...urlsFromDecoded])];

  const linkPairs = extractLinkPairs(decodedHtml);

  return {
    raw,
    inputType,
    headers: {
      from,
      replyTo,
      returnPath,
      subject,
      date: readHeader(parsedHeaders, 'Date'),
      authenticationResults,
      receivedSpf
    },
    body,
    urls,
    linkPairs,
    attachmentDetected: detectAttachment(raw),
    cssObfuscationDetected: detectCssObfuscation(decodedHtml || raw)
  };
}
