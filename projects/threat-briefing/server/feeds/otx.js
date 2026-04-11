import fetch from 'node-fetch';

const OTX_BASE = 'https://otx.alienvault.com/api/v1';

export async function fetchOTX() {
  const key = process.env.OTX_API_KEY;
  if (!key) {
    console.warn('[OTX] No OTX_API_KEY set — skipping OTX feed');
    return [];
  }

  try {
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const res   = await fetch(
      `${OTX_BASE}/pulses/subscribed?modified_since=${since}&limit=50`,
      { headers: { 'X-OTX-API-KEY': key }, signal: AbortSignal.timeout(15_000) }
    );
    if (!res.ok) throw new Error(`OTX HTTP ${res.status}`);
    const data = await res.json();

    return (data.results || []).map(pulse => ({
      source:            'OTX',
      title:             pulse.name,
      description:       pulse.description || '',
      tlp:               pulse.tlp || 'white',
      tags:              pulse.tags || [],
      iocs:              (pulse.indicators || []).map(i => ({
        type:  i.type,
        value: i.indicator,
        role:  i.role || null
      })),
      attackTactics:     (pulse.attack_ids || []).map(a => a.display_name),
      targetedCountries: pulse.targeted_countries || [],
      publishedAt:       pulse.modified
    }));
  } catch (e) {
    console.error('[OTX] Feed error:', e.message);
    return [];
  }
}
