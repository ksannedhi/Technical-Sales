const express = require("express");

function createAlertsRouter(state) {
  const router = express.Router();

  router.get("/", (req, res) => {
    const { severity, status, limit } = req.query;
    let results = state.alerts.slice();
    if (severity) results = results.filter((a) => a.severity === severity);
    if (status) results = results.filter((a) => a.status === status);
    const parsedLimit = Number(limit || 200);
    res.json(results.slice(0, Number.isFinite(parsedLimit) ? parsedLimit : 200));
  });

  router.get("/:id", (req, res) => {
    const alert = state.alerts.find((a) => a.id === req.params.id);
    if (!alert) return res.status(404).json({ error: "Alert not found" });
    res.json(alert);
  });

  router.patch("/:id/status", (req, res) => {
    const alert = state.alerts.find((a) => a.id === req.params.id);
    if (!alert) return res.status(404).json({ error: "Alert not found" });
    const allowed = ["new", "investigating", "escalated", "closed", "false_positive"];
    if (!allowed.includes(req.body.status)) {
      return res.status(400).json({ error: "Invalid status" });
    }
    alert.status = req.body.status;
    res.json(alert);
  });

  return router;
}

module.exports = { createAlertsRouter };