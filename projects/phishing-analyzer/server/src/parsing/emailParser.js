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
  return [...text.matchAll(/https?:\/\/[^\s)>"']+/gim)].map((match) => match[0]);
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

export function parseEmailInput(raw, inputType = 'raw_text') {
  const parsedHeaders = parseHeaders(raw);
  const from = readHeader(parsedHeaders, 'From');
  const replyTo = readHeader(parsedHeaders, 'Reply-To');
  const subject = readHeader(parsedHeaders, 'Subject');
  const returnPath = readHeader(parsedHeaders, 'Return-Path');
  const body = extractBody(raw);
  const urls = extractUrls(raw);
  const authenticationResults = readHeader(parsedHeaders, 'Authentication-Results');
  const receivedSpf = readHeader(parsedHeaders, 'Received-SPF');

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
    attachmentDetected: detectAttachment(raw),
    cssObfuscationDetected: detectCssObfuscation(raw)
  };
}
