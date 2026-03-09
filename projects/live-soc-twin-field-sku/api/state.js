const path = require("path");
const fs = require("fs");

const dataDir = path.join(__dirname, "..", "data");
const playbookDir = path.join(__dirname, "..", "engine", "playbooks");

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

const state = {
  alerts: [],
  incidents: [],
  scenarioRuns: new Map(),
  profile: "business_hours",
  hosts: readJson(path.join(dataDir, "fake-hosts.json"), []),
  users: readJson(path.join(dataDir, "fake-users.json"), []),
  mitre: readJson(path.join(dataDir, "mitre-ttps.json"), []),
  geos: readJson(path.join(dataDir, "geo-sources.json"), []),
  trafficProfiles: readJson(path.join(dataDir, "traffic-profiles.json"), {}),
  playbooks: {}
};

for (const file of fs.readdirSync(playbookDir)) {
  if (file.endsWith(".json")) {
    const p = path.join(playbookDir, file);
    const playbook = readJson(p, null);
    if (playbook && playbook.id) {
      state.playbooks[playbook.id] = playbook;
    }
  }
}

module.exports = state;