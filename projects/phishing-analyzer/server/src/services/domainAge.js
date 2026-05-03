const cache = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const TIMEOUT_MS = 3500;

function rootDomain(domain) {
  if (!domain) return '';
  const parts = domain.toLowerCase().split('.');
  return parts.length >= 2 ? parts.slice(-2).join('.') : domain.toLowerCase();
}

// Returns age in days, or null if lookup fails or times out.
export async function getDomainAgeDays(domain) {
  if (!domain) return null;

  const root = rootDomain(domain);
  const now = Date.now();

  const cached = cache.get(root);
  if (cached && now - cached.cachedAt < CACHE_TTL_MS) {
    return cached.days;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    // rdap.org aggregates across all TLD registries — no API key needed
    const res = await fetch(`https://rdap.org/domain/${root}`, {
      signal: controller.signal,
      headers: { Accept: 'application/rdap+json' }
    });
    clearTimeout(timer);

    if (!res.ok) return null;

    const data = await res.json();
    const registrationEvent = (data.events || []).find(
      (e) => e.eventAction === 'registration'
    );
    if (!registrationEvent?.eventDate) return null;

    const days = Math.floor(
      (now - new Date(registrationEvent.eventDate).getTime()) / (1000 * 60 * 60 * 24)
    );
    cache.set(root, { days, cachedAt: now });
    return days;
  } catch {
    return null;
  }
}
