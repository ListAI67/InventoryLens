import { safeRobloxThumbnailUrl } from "./endpoints";
import {
  graphicItemGrid,
  type GraphicBackgroundPreset,
  type GraphicExportDimensions,
  type GraphicFooterCell,
} from "./graphic-builder";

export interface DecodedGraphicImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  close?: () => void;
}

export interface GraphicRenderItem {
  key: string;
  name: string;
  label: string;
  thumbnailUrl?: string;
  copies: number;
  offSale: boolean;
}

export interface GraphicRenderModel {
  dimensions: GraphicExportDimensions;
  backgroundPreset: GraphicBackgroundPreset;
  headline: string;
  subheadline: string;
  footerCells: GraphicFooterCell[];
  username: string;
  displayName: string;
  avatarUrl?: string;
  showPlayerIdentity: boolean;
  showItemNames: boolean;
  items: GraphicRenderItem[];
}

export interface GraphicImageLoadOptions {
  createImage?: () => HTMLImageElement;
  timeoutMs?: number;
}

export type GraphicImageLoader = (url: string) => Promise<DecodedGraphicImage | undefined>;

/**
 * Loads only validated Roblox CDN raster images with anonymous CORS enabled.
 * Roblox's image CDN allows anonymous GETs, so the resulting canvas remains
 * exportable without broadening the extension's programmatic host access.
 */
export async function loadRobloxGraphicImage(
  input: string,
  options: GraphicImageLoadOptions = {},
): Promise<DecodedGraphicImage | undefined> {
  const url = safeRobloxThumbnailUrl(input);
  if (!url) return undefined;
  if (typeof Image === "undefined" && !options.createImage) return undefined;

  const image = options.createImage ? options.createImage() : new Image();
  image.crossOrigin = "anonymous";
  image.decoding = "async";
  image.referrerPolicy = "no-referrer";

  return new Promise<DecodedGraphicImage | undefined>((resolve) => {
    let settled = false;
    const finish = (value?: DecodedGraphicImage) => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      resolve(value);
    };
    const timer = globalThis.setTimeout(() => finish(), Math.max(1_000, options.timeoutMs ?? 15_000));
    image.onload = () => {
      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;
      finish(width && height ? { source: image, width, height } : undefined);
    };
    image.onerror = () => finish();
    image.src = url;
  });
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

function strokePanel(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  lineWidth: number,
): void {
  context.save();
  roundedRect(context, x, y, width, height, radius);
  context.strokeStyle = "rgba(255,255,255,.9)";
  context.lineWidth = lineWidth;
  context.stroke();
  context.restore();
}

function fitTextSize(
  context: CanvasRenderingContext2D,
  text: string,
  maximumWidth: number,
  startSize: number,
  minimumSize: number,
  family: string,
): number {
  let size = startSize;
  while (size > minimumSize) {
    context.font = `900 ${size}px ${family}`;
    if (context.measureText(text).width <= maximumWidth) break;
    size -= 2;
  }
  return size;
}

function ellipsize(
  context: CanvasRenderingContext2D,
  value: string,
  maximumWidth: number,
): string {
  const text = value.trim();
  if (context.measureText(text).width <= maximumWidth) return text;
  let output = text;
  while (output.length > 1 && context.measureText(`${output}…`).width > maximumWidth) {
    output = output.slice(0, -1);
  }
  return `${output.trimEnd()}…`;
}

function wrapLines(
  context: CanvasRenderingContext2D,
  value: string,
  maximumWidth: number,
  maximumLines = 3,
): string[] {
  const text = value.trim();
  if (!text || context.measureText(text).width <= maximumWidth) return [text];
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 2) return [ellipsize(context, text, maximumWidth)];

  const lines: string[] = [];
  while (words.length && lines.length < maximumLines) {
    if (lines.length === maximumLines - 1) {
      lines.push(ellipsize(context, words.join(" "), maximumWidth));
      break;
    }
    let line = words.shift()!;
    while (words.length && context.measureText(`${line} ${words[0]}`).width <= maximumWidth) {
      line += ` ${words.shift()}`;
    }
    lines.push(ellipsize(context, line, maximumWidth));
  }
  return lines;
}

function drawContainedImage(
  context: CanvasRenderingContext2D,
  image: DecodedGraphicImage,
  x: number,
  y: number,
  width: number,
  height: number,
  padding = 0,
): void {
  const availableWidth = Math.max(1, width - padding * 2);
  const availableHeight = Math.max(1, height - padding * 2);
  const scale = Math.min(availableWidth / image.width, availableHeight / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  context.drawImage(
    image.source,
    x + (width - drawWidth) / 2,
    y + (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
}

const BACKGROUND_GRADIENTS: Readonly<Record<
  GraphicBackgroundPreset,
  readonly (readonly [offset: number, color: string])[]
>> = Object.freeze({
  midnight: Object.freeze([[0, "#05070a"] as const, [0.55, "#111721"] as const, [1, "#030407"] as const]),
  neonGrid: Object.freeze([[0, "#050619"] as const, [0.5, "#10103a"] as const, [1, "#02030d"] as const]),
  royalPurple: Object.freeze([[0, "#0a0415"] as const, [0.48, "#35105b"] as const, [1, "#08020f"] as const]),
  sunset: Object.freeze([[0, "#160609"] as const, [0.52, "#641a1b"] as const, [1, "#120207"] as const]),
  arctic: Object.freeze([[0, "#03111f"] as const, [0.52, "#0a4161"] as const, [1, "#020b15"] as const]),
  emerald: Object.freeze([[0, "#02110c"] as const, [0.5, "#073c2b"] as const, [1, "#010906"] as const]),
  cleanBlack: Object.freeze([[0, "#020203"] as const, [0.52, "#0d0f13"] as const, [1, "#000000"] as const]),
});

function drawBackground(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  preset: GraphicBackgroundPreset,
): void {
  const gradient = context.createLinearGradient(0, 0, width, height);
  const gradientStops = BACKGROUND_GRADIENTS[preset] ?? BACKGROUND_GRADIENTS.midnight;
  for (const [offset, color] of gradientStops) gradient.addColorStop(offset, color);
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  if (preset === "cleanBlack") return;

  context.save();
  context.lineWidth = Math.max(1, width / 1800);

  if (preset === "midnight") {
    context.globalAlpha = 0.14;
    context.strokeStyle = "#93a4b8";
    const step = Math.max(28, Math.round(width / 44));
    for (let x = -height; x < width; x += step) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x + height, height);
      context.stroke();
    }
    context.globalAlpha = 0.08;
    for (let index = 0; index < 72; index += 1) {
      const seed = (index * 9301 + 49297) % 233280;
      const x = (seed / 233280) * width;
      const y = (((seed * 17) % 233280) / 233280) * height;
      const length = width * (0.012 + (index % 7) * 0.004);
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(Math.min(width, x + length), Math.max(0, y - length * 0.14));
      context.stroke();
    }
  } else if (preset === "neonGrid") {
    const horizon = height * 0.46;
    context.globalAlpha = 0.24;
    context.strokeStyle = "#52e8ff";
    for (let index = 0; index <= 20; index += 1) {
      context.beginPath();
      context.moveTo(width / 2, horizon);
      context.lineTo((index / 20) * width, height);
      context.stroke();
    }
    context.strokeStyle = "#ff54df";
    for (let index = 0; index <= 11; index += 1) {
      const ratio = index / 11;
      const y = horizon + (height - horizon) * ratio * ratio;
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y);
      context.stroke();
    }
    context.globalAlpha = 0.16;
    context.lineWidth = Math.max(2, width / 520);
    context.beginPath();
    context.moveTo(0, horizon);
    context.lineTo(width, horizon);
    context.stroke();
  } else if (preset === "royalPurple") {
    context.globalAlpha = 0.2;
    context.strokeStyle = "#d88cff";
    context.lineWidth = Math.max(2, width / 750);
    const centerX = width * 0.2;
    const centerY = height * 0.3;
    for (let index = 1; index <= 7; index += 1) {
      context.beginPath();
      context.arc(centerX, centerY, Math.min(width, height) * index * 0.075, 0, Math.PI * 2);
      context.stroke();
    }
    context.globalAlpha = 0.1;
    context.strokeStyle = "#ff8be8";
    for (let x = -height; x < width; x += Math.max(60, width / 16)) {
      context.beginPath();
      context.moveTo(x, height);
      context.lineTo(x + height * 0.72, 0);
      context.stroke();
    }
  } else if (preset === "sunset") {
    const originX = width * 0.7;
    const originY = height * 0.58;
    context.globalAlpha = 0.18;
    context.strokeStyle = "#ffb13b";
    context.lineWidth = Math.max(2, width / 850);
    for (let index = 0; index <= 18; index += 1) {
      context.beginPath();
      context.moveTo(originX, originY);
      context.lineTo((index / 18) * width, 0);
      context.stroke();
    }
    context.globalAlpha = 0.12;
    context.strokeStyle = "#ff596b";
    for (let index = 0; index < 12; index += 1) {
      const y = originY + index * ((height - originY) / 12);
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y);
      context.stroke();
    }
  } else if (preset === "arctic") {
    context.globalAlpha = 0.19;
    context.strokeStyle = "#a6f0ff";
    context.lineWidth = Math.max(1, width / 1100);
    for (let index = 0; index < 24; index += 1) {
      const x = ((index * 97) % 29) / 29 * width;
      const reach = height * (0.24 + (index % 5) * 0.07);
      context.beginPath();
      context.moveTo(x, height);
      context.lineTo(Math.max(0, x - width * 0.1), height - reach);
      context.lineTo(Math.min(width, x + width * 0.07), height - reach * 0.55);
      context.stroke();
    }
    context.globalAlpha = 0.15;
    context.fillStyle = "#d8f8ff";
    for (let index = 0; index < 48; index += 1) {
      const x = ((index * 73) % 101) / 101 * width;
      const y = ((index * 137) % 103) / 103 * height;
      context.beginPath();
      context.arc(x, y, Math.max(1.5, width / 1100), 0, Math.PI * 2);
      context.fill();
    }
  } else if (preset === "emerald") {
    context.globalAlpha = 0.15;
    context.strokeStyle = "#59ffb1";
    for (let index = 0; index <= 22; index += 1) {
      const x = (index / 22) * width;
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
    }
    context.globalAlpha = 0.18;
    context.fillStyle = "#72ffc0";
    for (let index = 0; index < 72; index += 1) {
      const column = index % 23;
      const row = Math.floor(index / 23);
      const x = (column / 23) * width + width * 0.012;
      const y = ((index * 47) % 89) / 89 * height + row * height * 0.025;
      context.fillRect(x, y % height, Math.max(2, width / 420), Math.max(7, height / 70));
    }
  }
  context.restore();
}

function drawHeadline(
  context: CanvasRenderingContext2D,
  model: GraphicRenderModel,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const headline = model.headline.trim() || `${model.displayName}'s collection`;
  const family = '"Arial Black", Impact, sans-serif';
  const fontSize = fitTextSize(context, headline, width - 40, height * 0.52, 28, family);
  context.save();
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `900 ${fontSize}px ${family}`;
  context.lineJoin = "round";
  context.shadowColor = "rgba(0,0,0,.9)";
  context.shadowBlur = Math.max(6, fontSize * 0.12);
  context.lineWidth = Math.max(3, fontSize * 0.055);
  context.strokeStyle = "rgba(0,0,0,.96)";
  context.strokeText(headline, x + width / 2, y + height * 0.42, width - 40);
  const gradient = context.createLinearGradient(x, y, x + width, y);
  gradient.addColorStop(0, "#ffd33d");
  gradient.addColorStop(0.32, "#ff7ad9");
  gradient.addColorStop(0.62, "#72e9ff");
  gradient.addColorStop(1, "#7dff9d");
  context.fillStyle = gradient;
  context.fillText(headline, x + width / 2, y + height * 0.42, width - 40);

  const subheadline = model.subheadline.trim();
  if (subheadline) {
    const subSize = fitTextSize(context, subheadline, width - 72, height * 0.22, 16, 'Arial, sans-serif');
    context.font = `800 ${subSize}px Arial, sans-serif`;
    context.shadowBlur = 4;
    context.fillStyle = "rgba(255,255,255,.94)";
    context.fillText(subheadline, x + width / 2, y + height * 0.77, width - 72);
  }
  context.restore();
}

function drawAvatarPanel(
  context: CanvasRenderingContext2D,
  model: GraphicRenderModel,
  avatar: DecodedGraphicImage | undefined,
  rect: { x: number; y: number; width: number; height: number },
): void {
  context.save();
  roundedRect(context, rect.x, rect.y, rect.width, rect.height, 24);
  const fill = context.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.height);
  fill.addColorStop(0, "rgba(23,31,43,.82)");
  fill.addColorStop(1, "rgba(5,7,10,.72)");
  context.fillStyle = fill;
  context.fill();
  context.clip();

  const labelHeight = model.showPlayerIdentity ? Math.max(64, rect.height * 0.13) : 0;
  if (avatar) {
    context.shadowColor = "rgba(112,222,255,.28)";
    context.shadowBlur = 30;
    drawContainedImage(context, avatar, rect.x + 10, rect.y + 12, rect.width - 20, rect.height - labelHeight - 12, 8);
  } else {
    context.fillStyle = "rgba(255,255,255,.08)";
    context.beginPath();
    context.arc(rect.x + rect.width / 2, rect.y + rect.height * 0.38, Math.min(rect.width, rect.height) * 0.13, 0, Math.PI * 2);
    context.fill();
  }

  if (model.showPlayerIdentity) {
    const labelY = rect.y + rect.height - labelHeight;
    context.fillStyle = "rgba(0,0,0,.62)";
    context.fillRect(rect.x, labelY, rect.width, labelHeight);
    context.textAlign = "center";
    context.textBaseline = "middle";
    const displaySize = Math.max(16, Math.min(34, rect.width / 12));
    context.font = `900 ${displaySize}px "Arial Black", Arial, sans-serif`;
    context.fillStyle = "#ffffff";
    context.fillText(ellipsize(context, model.displayName, rect.width - 30), rect.x + rect.width / 2, labelY + labelHeight * 0.4);
    context.font = `700 ${Math.max(13, displaySize * 0.52)}px Arial, sans-serif`;
    context.fillStyle = "#8edfff";
    context.fillText(ellipsize(context, `@${model.username}`, rect.width - 30), rect.x + rect.width / 2, labelY + labelHeight * 0.72);
  }
  context.restore();
  strokePanel(context, rect.x, rect.y, rect.width, rect.height, 24, Math.max(3, rect.width / 150));
}

function drawItemPanel(
  context: CanvasRenderingContext2D,
  model: GraphicRenderModel,
  images: ReadonlyMap<string, DecodedGraphicImage | undefined>,
  rect: { x: number; y: number; width: number; height: number },
): void {
  context.save();
  roundedRect(context, rect.x, rect.y, rect.width, rect.height, 24);
  context.fillStyle = "rgba(4,7,11,.5)";
  context.fill();
  context.clip();

  const portraitPanel = rect.height > rect.width * 1.05;
  const grid = graphicItemGrid(model.items.length, portraitPanel ? "portrait" : "wide");
  const columns = Math.max(1, grid.columns);
  const rows = Math.max(1, grid.rows);
  const gap = Math.max(8, Math.min(18, rect.width / 70));
  const innerX = rect.x + gap * 1.25;
  const innerY = rect.y + gap * 1.25;
  const innerWidth = rect.width - gap * 2.5;
  const innerHeight = rect.height - gap * 2.5;
  const cellWidth = (innerWidth - gap * (columns - 1)) / columns;
  const cellHeight = (innerHeight - gap * (rows - 1)) / rows;
  const colors = ["#ffe16b", "#ff80df", "#67e8ff", "#75f7ad"];

  if (!model.items.length) {
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = "rgba(255,255,255,.55)";
    context.font = `800 ${Math.max(18, rect.width / 28)}px Arial, sans-serif`;
    context.fillText("SELECT ITEMS TO BUILD YOUR GRAPHIC", rect.x + rect.width / 2, rect.y + rect.height / 2);
  }

  model.items.forEach((item, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = innerX + column * (cellWidth + gap);
    const y = innerY + row * (cellHeight + gap);
    const itemNameHeight = model.showItemNames ? Math.max(17, cellHeight * 0.12) : 0;
    const labelHeight = Math.max(30, cellHeight * 0.25);
    const imageHeight = cellHeight - itemNameHeight - labelHeight;
    const image = images.get(item.thumbnailUrl ?? "");

    context.save();
    context.shadowColor = "rgba(104,220,255,.16)";
    context.shadowBlur = Math.max(6, cellWidth * 0.05);
    if (image) drawContainedImage(context, image, x, y, cellWidth, imageHeight, Math.max(2, gap * 0.2));
    else {
      context.fillStyle = "rgba(255,255,255,.055)";
      roundedRect(context, x + gap, y + gap, cellWidth - gap * 2, Math.max(12, imageHeight - gap * 2), 10);
      context.fill();
    }
    context.restore();

    context.textAlign = "center";
    context.textBaseline = "middle";
    if (model.showItemNames) {
      const nameSize = Math.max(10, Math.min(19, cellWidth / 13));
      context.font = `700 ${nameSize}px Arial, sans-serif`;
      context.fillStyle = "rgba(255,255,255,.82)";
      context.fillText(ellipsize(context, item.name, cellWidth - 8), x + cellWidth / 2, y + imageHeight + itemNameHeight * 0.52);
    }
    const labelSize = Math.max(8, Math.min(24, cellWidth / 10));
    context.font = `900 ${labelSize}px "Arial Black", Arial, sans-serif`;
    context.lineWidth = Math.max(2, labelSize * 0.12);
    context.strokeStyle = "rgba(0,0,0,.94)";
    const labels = wrapLines(context, item.label || `×${item.copies} OWNED`, cellWidth - 6);
    const lineHeight = labelSize * 1.05;
    const labelCenterY = y + cellHeight - labelHeight * 0.47;
    const firstY = labelCenterY - ((labels.length - 1) * lineHeight) / 2;
    context.fillStyle = colors[index % colors.length]!;
    labels.forEach((label, lineIndex) => {
      const labelY = firstY + lineIndex * lineHeight;
      context.strokeText(label, x + cellWidth / 2, labelY);
      context.fillText(label, x + cellWidth / 2, labelY);
    });
  });
  context.restore();
  strokePanel(context, rect.x, rect.y, rect.width, rect.height, 24, Math.max(3, rect.width / 300));
}

function drawFooter(
  context: CanvasRenderingContext2D,
  model: GraphicRenderModel,
  rect: { x: number; y: number; width: number; height: number },
): void {
  const cells = model.footerCells;
  if (!cells.length) return;
  const cellWidth = rect.width / cells.length;
  const colors = ["#ffe16b", "#ff80df", "#75f7ad", "#67e8ff", "#ff9f6e"];
  context.save();
  roundedRect(context, rect.x, rect.y, rect.width, rect.height, 24);
  context.fillStyle = "rgba(5,8,12,.78)";
  context.fill();
  context.clip();
  cells.forEach((cell, index) => {
    const x = rect.x + index * cellWidth;
    if (index) {
      context.strokeStyle = "rgba(255,255,255,.34)";
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(x, rect.y + rect.height * 0.16);
      context.lineTo(x, rect.y + rect.height * 0.84);
      context.stroke();
    }
    const valueSize = fitTextSize(context, cell.value, cellWidth - 24, rect.height * 0.38, 14, '"Arial Black", Arial, sans-serif');
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = `900 ${valueSize}px "Arial Black", Arial, sans-serif`;
    context.fillStyle = colors[index % colors.length]!;
    context.fillText(cell.value, x + cellWidth / 2, rect.y + rect.height * 0.43, cellWidth - 24);
    const labelSize = fitTextSize(
      context,
      cell.label,
      cellWidth - 24,
      Math.max(11, rect.height * 0.13),
      8,
      "Arial, sans-serif",
    );
    context.font = `800 ${labelSize}px Arial, sans-serif`;
    context.fillStyle = "rgba(255,255,255,.88)";
    context.fillText(cell.label, x + cellWidth / 2, rect.y + rect.height * 0.72, cellWidth - 24);
  });
  context.restore();
  strokePanel(context, rect.x, rect.y, rect.width, rect.height, 24, Math.max(3, rect.width / 500));
}

/** Draws the exact high-resolution preview/export onto the provided canvas. */
export async function renderInventoryGraphic(
  canvas: HTMLCanvasElement,
  model: GraphicRenderModel,
  loadImage: GraphicImageLoader = (url) => loadRobloxGraphicImage(url),
): Promise<{ missingImages: number }> {
  const { width, height } = model.dimensions;
  if (width < 320 || height < 320 || width * height > 8_500_000) {
    throw new RangeError("Graphic dimensions are outside the supported export range.");
  }
  const urls = [...new Set([model.avatarUrl, ...model.items.map((item) => item.thumbnailUrl)].filter(
    (value): value is string => Boolean(value),
  ))];
  const entries = await Promise.all(urls.map(async (url) => {
    try {
      return [url, await loadImage(url)] as const;
    } catch {
      return [url, undefined] as const;
    }
  }));
  const images = new Map(entries);

  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("This browser could not create the graphic canvas.");

  drawBackground(context, width, height, model.backgroundPreset ?? "midnight");
  const margin = Math.max(18, Math.round(Math.min(width, height) * 0.025));
  const gap = Math.max(14, Math.round(margin * 0.55));
  const headerHeight = Math.round(height * 0.18);
  const hasFooter = model.footerCells.length > 0;
  const footerHeight = hasFooter ? Math.round(height * 0.13) : 0;
  const bodyY = margin + headerHeight + gap;
  const footerY = height - margin - footerHeight;
  const bodyHeight = hasFooter ? footerY - gap - bodyY : height - margin - bodyY;
  const contentWidth = width - margin * 2;

  strokePanel(context, margin, margin, contentWidth, headerHeight, 28, Math.max(3, width / 600));
  drawHeadline(context, model, margin, margin, contentWidth, headerHeight);

  if (width / height < 0.92) {
    const avatarHeight = Math.max(210, bodyHeight * 0.35);
    drawAvatarPanel(context, model, images.get(model.avatarUrl ?? ""), {
      x: margin,
      y: bodyY,
      width: contentWidth,
      height: avatarHeight,
    });
    drawItemPanel(context, model, images, {
      x: margin,
      y: bodyY + avatarHeight + gap,
      width: contentWidth,
      height: bodyHeight - avatarHeight - gap,
    });
  } else {
    const avatarWidth = Math.max(250, Math.round(contentWidth * (width / height > 1.45 ? 0.245 : 0.29)));
    drawAvatarPanel(context, model, images.get(model.avatarUrl ?? ""), {
      x: margin,
      y: bodyY,
      width: avatarWidth,
      height: bodyHeight,
    });
    drawItemPanel(context, model, images, {
      x: margin + avatarWidth + gap,
      y: bodyY,
      width: contentWidth - avatarWidth - gap,
      height: bodyHeight,
    });
  }
  if (hasFooter) {
    drawFooter(context, model, { x: margin, y: footerY, width: contentWidth, height: footerHeight });
  }

  return { missingImages: entries.filter(([, image]) => !image).length };
}

export function graphicFilename(username: string, preset: string): string {
  const safeUsername = username.trim().toLocaleLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "player";
  const safePreset = preset.replace(/[^a-z0-9_-]+/gi, "-").toLocaleLowerCase();
  return `inventory-lens-${safeUsername}-${safePreset || "graphic"}.png`;
}

export async function downloadCanvasPng(canvas: HTMLCanvasElement, filename: string): Promise<void> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error("The browser could not encode this PNG.")), "image/png");
  });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.download = filename;
    anchor.href = url;
    anchor.rel = "noopener";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
