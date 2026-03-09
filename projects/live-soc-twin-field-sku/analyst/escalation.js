function shouldEscalate(summary, alert) {
  return summary.risk_score >= 8 || alert.asset_criticality === "high";
}

module.exports = { shouldEscalate };