const express = require("express");
const { buildTicket, summarizeAlert } = require("../../analyst/ticket-factory");

const VALID_STATUSES = ["open", "in_progress", "resolved"];

function createTicketsRouter(state, io) {
  const router = express.Router();

  router.get("/", (_req, res) => {
    res.json(state.tickets);
  });

  router.get("/:id", (req, res) => {
    const ticket = state.tickets.find((t) => t.id === req.params.id);
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });
    res.json(ticket);
  });

  router.post("/", (req, res) => {
    const { alert_id, summary } = req.body;
    if (!alert_id) return res.status(400).json({ error: "alert_id is required" });

    const alert = state.alerts.find((a) => a.id === alert_id);
    if (!alert) return res.status(404).json({ error: "Alert not found" });

    const existing = state.tickets.find((t) => t.alert_id === alert_id);
    if (existing) return res.status(409).json({ error: "Ticket already exists for this alert", ticket: existing });

    const ticketSummary = summary || summarizeAlert(alert, {});
    const ticket = buildTicket(state, alert, ticketSummary, "analyst");
    state.tickets.push(ticket);
    io.emit("ticket:created", ticket);
    res.status(201).json({ ok: true, ticket });
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
