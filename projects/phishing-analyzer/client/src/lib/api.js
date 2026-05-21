// Retry once on transient connection failures. Two cases:
//   1. TypeError — fetch itself threw (ECONNREFUSED before Vite proxy was reached)
//   2. 503 with retryable:true — Vite proxy caught ECONNRESET from the backend
//      and returned a structured 503 rather than its default plain-text 500.
// Both happen during the brief window when node --watch restarts the server
// after its initial file-scan pass.
async function fetchWithRetry(url, options, retries = 1, retryDelayMs = 1000) {
  let response;
  try {
    response = await fetch(url, options);
  } catch (err) {
    if (retries > 0 && err instanceof TypeError) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      return fetchWithRetry(url, options, retries - 1, retryDelayMs);
    }
    throw err;
  }

  if (response.status === 503 && retries > 0) {
    const body = await response.json().catch(() => ({}));
    if (body.retryable) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      return fetchWithRetry(url, options, retries - 1, retryDelayMs);
    }
    // Non-retryable 503 — return as-is for caller to handle
    return new Response(JSON.stringify(body), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return response;
}

export async function analyzeEmail(payload) {
  const response = await fetchWithRetry('/api/analyze', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Analysis failed.' }));
    throw new Error(error.error || 'Analysis failed.');
  }

  return response.json();
}

export async function downloadReport(result, analystNote = '') {
  const response = await fetch('/api/report', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ result, analystNote })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Report generation failed.' }));
    throw new Error(error.error || 'Report generation failed.');
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/pdf')) {
    const errorText = await response.text().catch(() => '');
    throw new Error(errorText || 'The server did not return a valid PDF.');
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `phishing-report-${Date.now()}.pdf`;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();

  // Delay cleanup so the browser can finish consuming the blob URL.
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
    anchor.remove();
  }, 5000);
}
