// Attempt one fetch; on a network-level failure (TypeError — ECONNRESET,
// ECONNREFUSED) retry once after a short delay. This absorbs the brief
// unavailability window when node --watch restarts the server after its
// initial file-scan pass without surfacing an error to the user.
async function fetchWithRetry(url, options, retries = 1, retryDelayMs = 2000) {
  try {
    return await fetch(url, options);
  } catch (err) {
    if (retries > 0 && err instanceof TypeError) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      return fetchWithRetry(url, options, retries - 1, retryDelayMs);
    }
    throw err;
  }
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
