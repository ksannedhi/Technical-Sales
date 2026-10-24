import { useEffect, useMemo, useState } from "react";
import type { DiagramResponse } from "@shared/types/diagram";
import type { DiagramSeed } from "@shared/types/diagram";
import type { ArchitectureZone } from "@shared/types/architecture";

// ─── SVG seed renderer ────────────────────────────────────────────────────────

function SeedElement({ seed }: { seed: DiagramSeed }) {
  if (seed.type === "rectangle") {
    return (
      <rect
        x={seed.x}
        y={seed.y}
        width={seed.width ?? 0}
        height={seed.height ?? 0}
        fill={seed.backgroundColor ?? "#ffffff"}
        stroke={seed.strokeColor ?? "#374151"}
        strokeWidth={1.5}
        strokeDasharray={seed.strokeStyle === "dashed" ? "8 4" : undefined}
        rx={4}
      />
    );
  }

  if (seed.type === "text") {
    const lines = (seed.text ?? "").split("\n");
    const lh = (seed.fontSize ?? 16) * 1.3;
    return (
      <text fontSize={seed.fontSize ?? 16} fill={seed.strokeColor ?? "#18181b"}>
        {lines.map((line, i) => (
          <tspan key={i} x={seed.x} y={seed.y + (seed.fontSize ?? 16) + i * lh}>
            {line}
          </tspan>
        ))}
      </text>
    );
  }

  if (seed.type === "arrow" && seed.points) {
    const d = seed.points
      .map(([dx, dy], i) =>
        i === 0 ? `M ${seed.x} ${seed.y}` : `L ${seed.x + dx} ${seed.y + dy}`
      )
      .join(" ");
    return (
      <path
        d={d}
        fill="none"
        stroke={seed.strokeColor ?? "#374151"}
        strokeWidth={1.5}
        strokeDasharray={seed.strokeStyle === "dashed" ? "8 4" : undefined}
        markerEnd={
          seed.strokeStyle === "dashed" ? "url(#pm-arrow-gray)" : "url(#pm-arrow-dark)"
        }
      />
    );
  }

  return null;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const CSS = `
  @keyframes pm-slide { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:translateY(0) } }
  .pm-slide { opacity:0; animation: pm-slide 0.5s ease forwards }
`;

const btnBase: React.CSSProperties = {
  background: "rgba(255,255,255,0.07)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 8,
  color: "#e2e8f0",
  padding: "8px 18px",
  cursor: "pointer",
  fontSize: 13,
};

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  diagram: DiagramResponse;
  onClose: () => void;
}

export function PresentMode({ diagram, onClose }: Props) {
  const { architecture, elements, layout } = diagram;
  const [slide, setSlide] = useState(0);
  // React-driven visibility — avoids CSS animation-delay which pauses in background tabs
  const [visibleZoneCount, setVisibleZoneCount] = useState(0);
  const [connectionsVisible, setConnectionsVisible] = useState(false);

  const hasRationale = (architecture.securityRationale?.length ?? 0) > 0;
  const totalSlides = 2 + (hasRationale ? 1 : 0);

  const byId = useMemo(() => new Map(elements.map(e => [e.id, e])), [elements]);

  // Derive zone order from the elements array (already in render order)
  const sortedZoneIds = useMemo(
    () =>
      elements
        .filter(e => e.id.endsWith("-container"))
        .map(e => e.id.slice(0, -"-container".length)),
    [elements]
  );

  const sortedZones = useMemo(
    () =>
      sortedZoneIds
        .map(id => architecture.zones.find(z => z.id === id))
        .filter((z): z is ArchitectureZone => z !== undefined),
    [sortedZoneIds, architecture.zones]
  );

  const connectionIds = useMemo(
    () =>
      new Set(
        architecture.connections.flatMap(c => [c.id, `${c.id}-label-bg`, `${c.id}-label`])
      ),
    [architecture.connections]
  );

  // Auto-advance title slide after 3 s
  useEffect(() => {
    if (slide !== 0) return;
    const t = setTimeout(() => setSlide(1), 3000);
    return () => clearTimeout(t);
  }, [slide]);

  // Staggered zone reveal on architecture slide — React intervals work in background tabs
  useEffect(() => {
    if (slide !== 1) return;
    setVisibleZoneCount(0);
    setConnectionsVisible(false);

    let count = 0;
    const ZONE_STEP_MS = 650;
    const id = setInterval(() => {
      count++;
      if (count <= sortedZones.length) {
        setVisibleZoneCount(count);
      } else {
        setConnectionsVisible(true);
        clearInterval(id);
      }
    }, ZONE_STEP_MS);

    return () => clearInterval(id);
  }, [slide, sortedZones.length]);

  // Keyboard nav
  useEffect(() => {
    function handle(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" || e.key === " ")
        setSlide(s => Math.min(s + 1, totalSlides - 1));
      if (e.key === "ArrowLeft") setSlide(s => Math.max(s - 1, 0));
    }
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [onClose, totalSlides]);

  return (
    <>
      <style>{CSS}</style>
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 1000,
          backgroundColor: "#0f172a",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        {/* Dot navigation */}
        <div
          style={{
            position: "absolute",
            top: 20,
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            gap: 8,
          }}
        >
          {Array.from({ length: totalSlides }).map((_, i) => (
            <div
              key={i}
              onClick={() => setSlide(i)}
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: i === slide ? "#fff" : "rgba(255,255,255,0.25)",
                cursor: "pointer",
                transition: "background 0.2s",
              }}
            />
          ))}
        </div>

        {/* Close */}
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: 14,
            right: 16,
            ...btnBase,
            padding: "5px 14px",
            color: "#64748b",
          }}
        >
          ✕ Close
        </button>

        {/* ── Slide 0: Title ───────────────────────────────────────────────── */}
        {slide === 0 && (
          <div
            key="title"
            style={{ textAlign: "center", padding: "48px 40px", maxWidth: 680 }}
          >
            <p
              style={{
                fontSize: 11,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "#475569",
                marginBottom: 18,
                margin: "0 0 18px",
              }}
            >
              Network Security Architecture
            </p>
            <h1
              style={{
                fontSize: "clamp(24px, 4vw, 52px)",
                fontWeight: 700,
                color: "#f8fafc",
                margin: "0 0 20px",
                lineHeight: 1.15,
              }}
            >
              {architecture.title}
            </h1>
            <p
              style={{
                fontSize: "clamp(14px, 1.6vw, 18px)",
                color: "#94a3b8",
                lineHeight: 1.7,
                margin: 0,
              }}
            >
              {architecture.summary}
            </p>
            {architecture.assumptions.length > 0 && (
              <div
                style={{
                  marginTop: 28,
                  padding: "14px 18px",
                  background: "rgba(255,255,255,0.04)",
                  borderRadius: 10,
                  textAlign: "left",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <p
                  style={{
                    fontSize: 10,
                    color: "#475569",
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    margin: "0 0 8px",
                  }}
                >
                  Assumptions
                </p>
                <ul
                  style={{
                    margin: 0,
                    paddingLeft: 16,
                    color: "#64748b",
                    fontSize: 13,
                    lineHeight: 1.7,
                  }}
                >
                  {architecture.assumptions.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </div>
            )}
            <p style={{ marginTop: 36, fontSize: 11, color: "#334155", margin: "36px 0 0" }}>
              Advances automatically · press → or Space to skip
            </p>
          </div>
        )}

        {/* ── Slide 1: Architecture SVG ────────────────────────────────────── */}
        {slide === 1 && (
          <div
            key="arch"
            style={{
              width: "100%",
              height: "100%",
              padding: "52px 20px 72px",
              overflow: "auto",
            }}
          >
            <svg
              viewBox={`0 0 ${layout.width} ${layout.height}`}
              style={{
                width: "100%",
                maxWidth: layout.width,
                margin: "0 auto",
                display: "block",
              }}
              preserveAspectRatio="xMidYMin meet"
            >
              <defs>
                <marker
                  id="pm-arrow-dark"
                  markerWidth="10"
                  markerHeight="7"
                  refX="9"
                  refY="3.5"
                  orient="auto"
                >
                  <polygon points="0 0,10 3.5,0 7" fill="#374151" />
                </marker>
                <marker
                  id="pm-arrow-gray"
                  markerWidth="10"
                  markerHeight="7"
                  refX="9"
                  refY="3.5"
                  orient="auto"
                >
                  <polygon points="0 0,10 3.5,0 7" fill="#6b7280" />
                </marker>
              </defs>

              {/* Zone groups — revealed progressively via React state */}
              {sortedZones.map((zone, zi) => {
                const visible = zi < visibleZoneCount;
                const zoneComponents = architecture.components.filter(
                  c => c.zoneId === zone.id
                );
                const containerSeed = byId.get(`${zone.id}-container`);
                const titleSeed = byId.get(`${zone.id}-title`);

                return (
                  <g
                    key={zone.id}
                    style={{
                      opacity: visible ? 1 : 0,
                      transition: "opacity 0.45s ease",
                    }}
                  >
                    {containerSeed && <SeedElement seed={containerSeed} />}
                    {titleSeed && <SeedElement seed={titleSeed} />}
                    {zoneComponents.map(comp => {
                      const boxSeed = byId.get(`${comp.id}-box`);
                      const labelSeed = byId.get(`${comp.id}-label`);
                      return (
                        <g key={comp.id}>
                          {boxSeed && <SeedElement seed={boxSeed} />}
                          {labelSeed && <SeedElement seed={labelSeed} />}
                        </g>
                      );
                    })}
                  </g>
                );
              })}

              {/* Connections — appear after all zones */}
              <g
                style={{
                  opacity: connectionsVisible ? 1 : 0,
                  transition: "opacity 0.45s ease",
                }}
              >
                {elements
                  .filter(e => connectionIds.has(e.id))
                  .map(seed => (
                    <SeedElement key={seed.id} seed={seed} />
                  ))}
              </g>
            </svg>
          </div>
        )}

        {/* ── Slide 2: Security Rationale ──────────────────────────────────── */}
        {slide === 2 && architecture.securityRationale && (
          <div
            key="rationale"
            style={{ maxWidth: 680, padding: "0 40px", width: "100%" }}
          >
            <p
              style={{
                fontSize: 11,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "#3b82f6",
                fontWeight: 600,
                margin: "0 0 28px",
              }}
            >
              Why this design
            </p>
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                display: "flex",
                flexDirection: "column",
                gap: 18,
              }}
            >
              {architecture.securityRationale.map((point, i) => (
                <li
                  key={i}
                  className="pm-slide"
                  style={{
                    animationDelay: `${i * 0.13}s`,
                    display: "flex",
                    gap: 14,
                    color: "#e2e8f0",
                    fontSize: "clamp(14px, 1.5vw, 17px)",
                    lineHeight: 1.65,
                  }}
                >
                  <span
                    style={{ color: "#3b82f6", flexShrink: 0, marginTop: 3 }}
                  >
                    →
                  </span>
                  {point}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Bottom navigation */}
        <div
          style={{
            position: "absolute",
            bottom: 20,
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            gap: 10,
          }}
        >
          {slide > 0 && (
            <button onClick={() => setSlide(s => Math.max(0, s - 1))} style={btnBase}>
              ← Back
            </button>
          )}
          {slide < totalSlides - 1 && (
            <button
              onClick={() => setSlide(s => Math.min(totalSlides - 1, s + 1))}
              style={{
                ...btnBase,
                background: "rgba(59,130,246,0.2)",
                borderColor: "rgba(59,130,246,0.35)",
                color: "#93c5fd",
              }}
            >
              Next →
            </button>
          )}
          {slide === totalSlides - 1 && (
            <button onClick={onClose} style={{ ...btnBase, color: "#64748b" }}>
              Done
            </button>
          )}
        </div>
      </div>
    </>
  );
}
