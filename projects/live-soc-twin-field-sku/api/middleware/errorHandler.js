function errorHandler(err, _req, res, _next) {
  console.error("[API]", err.message);
  res.status(500).json({ error: err.message || "Internal server error" });
}

module.exports = { errorHandler };