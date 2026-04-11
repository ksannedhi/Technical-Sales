import fetch from 'node-fetch';

const KEV_URL = 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json';

export async function fetchCISAKEV() {
  try {
    const res  = await fetch(KEV_URL, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`CISA KEV HTTP ${res.status}`);
    const data = await res.json();

    const cutoff = Date.now() - 86_400_000;
    return (data.vulnerabilities || [])
      .filter(v => new Date(v.dateAdded).getTime() > cutoff)
      .map(v => ({
        source:         'CISA-KEV',
        cveId:          v.cveID,
        product:        `${v.vendorProject} ${v.product}`,
        description:    v.shortDescription,
        dueDate:        v.dueDate,
        ransomwareUse:  v.knownRansomwareCampaignUse === 'Known',
        publishedAt:    v.dateAdded
      }));
  } catch (e) {
    console.error('[CISA] Feed error:', e.message);
    return [];
  }
}
