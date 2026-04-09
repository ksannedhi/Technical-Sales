import {
  convertToExcalidrawElements,
  exportToBlob,
  exportToSvg,
} from "@excalidraw/excalidraw";
import type { AppState, BinaryFiles, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { DiagramSeed } from "@shared/types/diagram";

export function toExcalidrawElements(elements: DiagramSeed[]) {
  return convertToExcalidrawElements(
    elements.map((element) => {
      if (element.type === "text") {
        return {
          type: "text",
          id: element.id,
          x: element.x,
          y: element.y,
          text: element.text ?? "",
          fontSize: element.fontSize ?? 18,
          strokeColor: element.strokeColor ?? "#18181b",
          backgroundColor: "transparent",
          width: 0,
          height: 0,
        };
      }

      if (element.type === "arrow") {
        return {
          type: "arrow",
          id: element.id,
          x: element.x,
          y: element.y,
          points: element.points ?? [
            [0, 0],
            [100, 100],
          ],
          strokeColor: element.strokeColor ?? "#27272a",
          strokeStyle: element.strokeStyle ?? "solid",
          label: {
            text: element.labelText ?? "",
          },
        };
      }

      return {
        type: "rectangle",
        id: element.id,
        x: element.x,
        y: element.y,
        width: element.width ?? 180,
        height: element.height ?? 72,
        strokeColor: element.strokeColor ?? "#27272a",
        backgroundColor: element.backgroundColor ?? "#ffffff",
        fillStyle: element.fillStyle ?? "solid",
        roughness: element.roughness ?? 1,
      };
    }),
  );
}

function getScene(api: ExcalidrawImperativeAPI) {
  const elements = api.getSceneElements();
  const appState = api.getAppState() as Partial<AppState>;
  const files = api.getFiles() as BinaryFiles;
  return {
    elements,
    appState: {
      ...appState,
      exportBackground: true,
      viewBackgroundColor: "#f4f1ea",
    },
    files,
  };
}

export async function exportSceneAsPng(api: ExcalidrawImperativeAPI) {
  return exportToBlob({
    ...getScene(api),
    mimeType: "image/png",
  });
}

export async function exportSceneAsSvg(api: ExcalidrawImperativeAPI) {
  return exportToSvg(getScene(api));
}
