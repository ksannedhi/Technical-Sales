const baseUrl = process.env.SOC_TWIN_API || "http://localhost:3001";

async function main() {
  const res = await fetch(`${baseUrl}/api/health`);
  const body = await res.json();
  console.log(JSON.stringify(body, null, 2));
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});