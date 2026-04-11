function topN(arr, n) {
  const freq = arr.reduce((acc, v) => {
    acc[v] = (acc[v] || 0) + 1;
    return acc;
  }, {});
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k);
}

export function normalise({ otx, cisa, abusech }) {
  return {
    generatedAt:   new Date().toISOString(),
    totalSignals:  otx.length + cisa.length + abusech.length,
    feeds: {
      otxPulses:      otx,
      cisaKEVAdded:   cisa,
      malwareSamples: abusech
    },
    stats: {
      criticalCVEs:           cisa.filter(v => v.ransomwareUse).length,
      uniqueMalwareFamilies:  [...new Set(abusech.map(s => s.malwareFamily))],
      mostTargetedTactics:    topN(otx.flatMap(p => p.attackTactics), 5),
      gccTargeted:            otx.filter(p =>
        p.targetedCountries.some(c =>
          ['Kuwait', 'Saudi Arabia', 'UAE', 'Bahrain', 'Qatar', 'Oman'].includes(c)
        )
      ).length
    }
  };
}
