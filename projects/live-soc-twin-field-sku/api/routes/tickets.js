const express = require("express");

const VALID_STATUSES = ["open", "in_progress", "resolved"];

function createTicketsRouter(state) {
  const router = express.Router();

  router.get("/", (_req, res) => {
    res.json(state.tickets);
  });

  router.get("/:id", (req, res) => {
    const ticket = state.tickets.find((t) => t.id === req.params.id);
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });
    res.json(ticket);
  });

  router.patch("/:id/status", (req, res) => {
    const ticket = state.tickets.find((t) => t.id === req.params.id);
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });
    const { status } = req.body;
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(", ")}` });
    }
    ticket.status = status;
    ticket.updated_at = new Date().toISOString();
    res.json({ ok: true, ticket });
  });

  return router;
}

module.exports = { createTicketsRouter };
