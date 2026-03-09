const express = require("express");

function createIncidentsRouter(state) {
  const router = express.Router();

  router.get("/", (_req, res) => {
    res.json(state.incidents);
  });

  router.get("/:id", (req, res) => {
    const incident = state.incidents.find((i) => i.id === req.params.id);
    if (!incident) return res.status(404).json({ error: "Incident not found" });
    res.json({
      ...incident,
      alerts: state.alerts.filter((a) => incident.alert_ids.includes(a.id))
    });
  });

  return router;
}

module.exports = { createIncidentsRouter };