const baseUrl = process.env.SOC_TWIN_API || "http://localhost:3001";

async function main() {
  const scenario = process.argv[2];
  if (!scenario) {
    console.error("Usage: node scripts/trigger-scenario.js <scenario_id>");
    process.exit(1);
  }

  const res = await fetch(`${baseUrl}/api/scenarios/trigger`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scenario_id: scenario, speed_multiplier: 1 })
  });

  const body = await res.json();
  console.log(JSON.stringify(body, null, 2));
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});