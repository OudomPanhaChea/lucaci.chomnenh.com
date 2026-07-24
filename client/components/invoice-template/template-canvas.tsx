"use client";
import { forwardRef } from "react";
import { CANVAS_W, CANVAS_H, type TemplateElement } from "./types";
import type { InvoiceData } from "./bindings";
import ElementView from "./element-view";

// Read-only A4 sheet: renders every element at its absolute position. `scale`
// shrinks it for on-screen display without changing stored coordinates (the
// outer box is sized to the scaled dimensions so page flow stays correct).
// The inner sheet carries data-paper-page so the shared PaperModal can export it.
const TemplateCanvas = forwardRef<HTMLDivElement, {
  elements: TemplateElement[];
  data: InvoiceData;
  scale?: number;
}>(function TemplateCanvas({ elements, data, scale = 1 }, ref) {
  return (
    <div
      style={{ width: CANVAS_W * scale, height: CANVAS_H * scale, overflow: "hidden" }}
      className="shadow-lg"
    >
      <div
        ref={ref}
        data-paper-page
        style={{
          width: CANVAS_W,
          height: CANVAS_H,
          background: "#fff",
          position: "relative",
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          fontFamily: "'Fira Sans', system-ui, sans-serif",
        }}
      >
        {elements.map((el) => (
          <div
            key={el.id}
            style={{ position: "absolute", left: el.x, top: el.y, width: el.w, height: el.h }}
          >
            <ElementView el={el} data={data} />
          </div>
        ))}
      </div>
    </div>
  );
});

export default TemplateCanvas;
