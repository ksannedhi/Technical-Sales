# Product Spec

## Purpose

`Network Security Diagrammer` is a local app that turns rough network and security prompts into clean Excalidraw diagrams.

The app is meant to:

- infer likely architectural intent from incomplete prompts
- enforce sound architectural patterns
- keep output simple and presentation-friendly
- preserve explicit entities named by the user
- support iterative refinement through follow-up prompts

## Scope

Current scope:

- network and security architecture diagrams
- English prompts only
- local laptop execution
- no authentication
- Excalidraw-based editable canvas
- architect-level conceptual output by default

Out of scope for the current MVP:

- implementation-grade infrastructure detail by default
- multi-user collaboration
- free-form unsafe design generation
- provider-specific rendering unless the prompt explicitly asks for it

## System Flow

The current flow is:

1. analyze the prompt
2. classify it into a pattern family
3. build a deterministic architecture model
4. lay out the model locally
5. render the scene in Excalidraw

OpenAI is optional and currently used for:

- prompt analysis
- follow-up editing assistance

OpenAI is not the primary author of the final base topology. The architecture model and layout engine are deterministic and local.

## Prompt Analysis

Each prompt is classified as:

- `clear`
- `ambiguous`
- `bad`

Rules:

- `clear`: generate immediately
- `ambiguous`: show `Assumptions made` and require explicit confirmation
- `bad`: warn and offer a secure alternative

Assumptions should only include material inferences. Default behavior should not appear as a user-facing assumption.

## Vendor Neutrality

Vendor neutrality is the default.

Examples:

- `cloud environment` stays generic
- `hybrid cloud` stays generic unless a provider is named
- `AWS`, `Azure`, `GCP`, `Exchange`, `OAuth2`, `OIDC`, and similar explicit terms are preserved when the prompt names them

## Follow-Up Behavior

Follow-up prompts edit the current architecture instead of starting over.

Supported edit intents:

- rename
- remove
- add
- simplify
- refine labels or relationships

The UI separates:

- `Prompt history`: what the user asked
- `Assumptions`: what the app inferred from the original prompt
- `Applied changes`: what the app actually changed after follow-ups

`Applied changes` is capped so the list does not grow unbounded.

## Output Principles

- simplicity first
- architectural intent first, zones second
- preserve explicit prompt entities
- reduce clutter and secondary arrows
- prefer conceptual architect-level diagrams
- prefer pattern-specific topology over generic fallback

## Pattern Library

Current pattern families include:

- partner API security
- hybrid identity and cloud
- identity access
- wireless network / SSIDs
- hybrid connectivity
- remote access / VPN
- WAF in DMZ
- email security
- DDoS protection
- sandbox analysis
- NDR visibility
- branch networking
- centralized logging / SIEM
- segmentation
- zero trust
- cloud workload protection

Pattern selection is score-based instead of simple first-match ordering.

## Layout and Rendering Rules

The layout engine currently aims for:

- readable top-to-bottom flow by default
- cleaner sibling and upward arrow routing
- wider support for connection labels on solid arrows
- unified zone widths within a single diagram
- denser label wrapping for patterns with more than 10 components
- editable Excalidraw output without remounting the canvas on every update

## UX Rules

- main prompt clears on submit
- follow-up prompt clears on submit
- prompt history remains visible
- follow-up prompt lives below the diagram area
- Excalidraw handles export through its own UI
- title and summary should reflect prompt intent and generated architecture

## Caching

- prompt analysis responses are cached
- diagram generation responses are cached
- cache keys include model identity so stale results are less likely when model configuration changes
- the cache currently lives in the project-level `cache/` directory

## Quality Goals

The app should produce diagrams that are:

- readable at a glance
- visually balanced
- not overly zone-heavy
- text-safe with minimal clipping
- based on the right pattern family
- stable under follow-up edits

## Remaining Quality Work

Areas that still benefit from continued tuning:

- more benchmark-driven pattern refinement
- denser-pattern layout polish
- better handling for prompts that do not fit the current pattern library cleanly
- stronger summary wording for edge cases
