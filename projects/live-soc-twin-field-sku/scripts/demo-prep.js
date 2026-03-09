const baseUrl = process.env.SOC_TWIN_API || "http://localhost:3001";

async function call(path, method = "GET", body) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  return res.json();
}

async function main() {
  const reset = await call("/api/reset", "POST");
  const seed = await call("/api/seed", "POST", { count: 15 });
  const health = await call("/api/health", "GET");

  console.log(JSON.stringify({ reset, seed, health }, null, 2));
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});