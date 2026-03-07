import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { Resvg } from "@resvg/resvg-js";
import type { CaptionTemplate, CaptionTrack } from "@clawcut/domain";

export interface CaptionBurnInPlate {
  segmentId: string;
  imagePath: string;
  startUs: number;
  endUs: number;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&apos;");
}

function fontFamilyForTemplate(template: CaptionTemplate): string {
  switch (template.fontFamilyIntent) {
    case "display":
      return "'Arial Black', 'Helvetica Neue', Arial, sans-serif";
    case "serif":
      return "Georgia, 'Times New Roman', serif";
    case "sans":
      return "'Helvetica Neue', Arial, sans-serif";
  }
}

function fontSizeForTemplate(template: CaptionTemplate): number {
  switch (template.fontScale) {
    case "small":
      return 34;
    case "medium":
      return 46;
    case "large":
      return 58;
    case "hero":
      return 76;
  }
}

function backgroundFill(template: CaptionTemplate): string | null {
  switch (template.backgroundStyle) {
    case "none":
      return null;
    case "boxed":
      return "rgba(17, 24, 39, 0.86)";
    case "card":
      return "rgba(15, 23, 42, 0.9)";
    case "highlight":
      return `${template.accentColor}CC`;
  }
}

function resolvePlacementBox(
  width: number,
  height: number,
  template: CaptionTemplate,
  boxWidth: number,
  boxHeight: number
): { x: number; y: number } {
  switch (template.placement) {
    case "lower-third":
      return {
        x: 84,
        y: height - boxHeight - 144
      };
    case "top-headline":
      return {
        x: Math.round((width - boxWidth) / 2),
        y: 56
      };
    case "center-card":
      return {
        x: Math.round((width - boxWidth) / 2),
        y: Math.round((height - boxHeight) / 2)
      };
    case "bottom-center":
      return {
        x: Math.round((width - boxWidth) / 2),
        y: height - boxHeight - 88
      };
  }
}

function createCaptionPlateSvg(
  template: CaptionTemplate,
  text: string,
  width: number,
  height: number
): string {
  const lines = text.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
  const safeLines = lines.length > 0 ? lines : [" "];
  const fontSize = fontSizeForTemplate(template);
  const lineHeight = Math.round(fontSize * 1.24);
  const estimatedTextWidth =
    Math.max(...safeLines.map((line) => Math.max(1, line.length))) * fontSize * 0.56;
  const boxWidth = Math.min(width - 160, Math.max(320, Math.round(estimatedTextWidth + 64)));
  const boxHeight = Math.round(safeLines.length * lineHeight + 40);
  const placement = resolvePlacementBox(width, height, template, boxWidth, boxHeight);
  const fill = backgroundFill(template);
  const anchor =
    template.alignment === "left" ? "start" : template.alignment === "right" ? "end" : "middle";
  const textX =
    template.alignment === "left"
      ? placement.x + 28
      : template.alignment === "right"
        ? placement.x + boxWidth - 28
        : placement.x + boxWidth / 2;
  const firstBaseline = placement.y + 30 + fontSize;
  const tspans = safeLines
    .map(
      (line, index) =>
        `<tspan x="${textX}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`
    )
    .join("");

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="rgba(0,0,0,0)" />
  ${fill ? `<rect x="${placement.x}" y="${placement.y}" width="${boxWidth}" height="${boxHeight}" rx="24" fill="${fill}" />` : ""}
  <text
    x="${textX}"
    y="${firstBaseline}"
    fill="${template.textColor}"
    text-anchor="${anchor}"
    font-family="${fontFamilyForTemplate(template)}"
    font-size="${fontSize}"
    font-weight="${template.fontWeight}"
  >${tspans}</text>
</svg>`.trim();
}

export async function renderCaptionTrackToPngPlates(input: {
  track: CaptionTrack;
  template: CaptionTemplate;
  width: number;
  height: number;
  outputDirectory: string;
}): Promise<CaptionBurnInPlate[]> {
  await mkdir(input.outputDirectory, { recursive: true });

  const plates: CaptionBurnInPlate[] = [];

  for (const segment of input.track.segments.filter((entry) => entry.enabled)) {
    const imagePath = join(
      input.outputDirectory,
      `caption-${String(segment.index + 1).padStart(4, "0")}.png`
    );
    const svg = createCaptionPlateSvg(input.template, segment.text, input.width, input.height);
    const pngData = new Resvg(svg, {
      font: {
        loadSystemFonts: true
      }
    })
      .render()
      .asPng();

    await writeFile(imagePath, pngData);
    plates.push({
      segmentId: segment.id,
      imagePath,
      startUs: segment.startUs,
      endUs: segment.endUs
    });
  }

  return plates;
}
