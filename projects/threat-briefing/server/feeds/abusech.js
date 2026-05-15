import fetch from 'node-fetch';

const BAZAAR_URL = 'https://mb-api.abuse.ch/api/v1/';

export async function fetchAbusech() {
  try {
    const params = new URLSearchParams({ query: 'get_recent', selector: '100' });
    if (process.env.ABUSECH_API_KEY) params.append('api_key', process.env.ABUSECH_API_KEY);

    const res = await fetch(BAZAAR_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    params.toString(),
      signal:  AbortSignal.timeout(15_000)
    });
    if (!res.ok) throw new Error(`Abuse.ch HTTP ${res.status}`);
    const data = await res.json();

    return (data.data || []).map(s => ({
      source:          'MalwareBazaar',
      sha256:          s.sha256_hash,
      fileName:        s.file_name,
      fileType:        s.file_type,
      malwareFamily:   s.tags?.length ? s.tags[0] : 'unknown',
      malwareTags:     s.tags || [],
      deliveryMethod:  s.delivery_method || null,
      publishedAt:     s.first_seen
    }));
  } catch (e) {
    console.error('[Abuse.ch] Feed error:', e.message);
    return [];
  }
}
