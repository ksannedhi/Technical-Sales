#!/usr/bin/env bash
# setup.sh — One-time setup for presales-skills plugin (Mac/Linux)
# Run from the cloned repo root: bash skills/presales-skills/setup.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
MARKETPLACE_NAME="ksannedhi-Technical-Sales"
MARKETPLACE_PATH="$HOME/.claude/plugins/marketplaces/$MARKETPLACE_NAME"
KNOWN_MARKETPLACES="$HOME/.claude/plugins/known_marketplaces.json"

echo ""
echo "Presales Skills — Plugin Setup"
echo "Repo root: $REPO_ROOT"

# Step 1: Create symlink
if [ -L "$MARKETPLACE_PATH" ] || [ -d "$MARKETPLACE_PATH" ]; then
    echo "[skip] Symlink/directory already exists at $MARKETPLACE_PATH"
else
    mkdir -p "$(dirname "$MARKETPLACE_PATH")"
    ln -s "$REPO_ROOT" "$MARKETPLACE_PATH"
    echo "[ok]   Symlink created -> $REPO_ROOT"
fi

# Step 2: Register marketplace
if [ ! -f "$KNOWN_MARKETPLACES" ]; then
    echo "Error: known_marketplaces.json not found at $KNOWN_MARKETPLACES. Is Claude Code installed?"
    exit 1
fi

if grep -q "\"$MARKETPLACE_NAME\"" "$KNOWN_MARKETPLACES"; then
    echo "[skip] Marketplace '$MARKETPLACE_NAME' already registered"
else
    TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
    # Insert new entry before closing brace
    python3 - <<EOF
import json, sys
with open("$KNOWN_MARKETPLACES", "r") as f:
    data = json.load(f)
data["$MARKETPLACE_NAME"] = {
    "source": {"source": "github", "repo": "ksannedhi/Technical-Sales"},
    "installLocation": "$MARKETPLACE_PATH",
    "lastUpdated": "$TIMESTAMP"
}
with open("$KNOWN_MARKETPLACES", "w") as f:
    json.dump(data, f, indent=2)
print("[ok]   Marketplace registered in known_marketplaces.json")
EOF
fi

echo ""
echo "Setup complete. Now inside Claude Code run:"
echo "  /plugin install presales-skills@ksannedhi-Technical-Sales"
echo "  /reload-plugins"
echo ""
