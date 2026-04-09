import { useEffect, useMemo, useState } from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { DiagramSeed } from "@shared/types/diagram";
import { toExcalidrawElements } from "../lib/excalidraw";

interface DiagramCanvasProps {
  title: string;
  elements: DiagramSeed[];
}

export function DiagramCanvas({ title, elements }: DiagramCanvasProps) {
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const excalidrawElements = useMemo(() => toExcalidrawElements(elements), [elements]);

  useEffect(() => {
    if (!api) {
      return;
    }

    api.updateScene({
      elements: excalidrawElements,
      appState: {
        viewBackgroundColor: "#f4f1ea",
        currentItemFontFamily: 1,
      },
    });
    api.scrollToContent(excalidrawElements, {
      fitToContent: true,
    });
  }, [api, excalidrawElements, title]);

  return (
    <section className="panel canvas-panel">
      <div className="status-header">
        <h2>{title}</h2>
        <span className="status-pill neutral">Editable canvas</span>
      </div>
      <div className="canvas-shell">
        <Excalidraw
          excalidrawAPI={setApi}
          theme="light"
          initialData={{
            elements: excalidrawElements,
            appState: {
              viewBackgroundColor: "#f4f1ea",
              currentItemFontFamily: 1,
            },
            scrollToContent: true,
          }}
        />
      </div>
    </section>
  );
}
