function errorHandler(err, _req, res, _next) {
  console.error("[API]", err.message);
  const message = err.message || "Internal server error";
  const status = message.includes("Anthropic triage failed") ? 502 : 500;
  res.status(status).json({ error: message });
}

module.exports = { errorHandler };
