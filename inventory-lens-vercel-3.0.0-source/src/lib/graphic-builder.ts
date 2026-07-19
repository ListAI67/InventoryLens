export const GRAPHIC_DRAFT_VERSION = 1 as const;
export const MAX_GRAPHIC_ITEMS = 18;

export type GraphicExportPreset = "landscape" | "square" | "portrait";
export type GraphicBackgroundPreset =
  | "midnight"
  | "neonGrid"
  | "royalPurple"
  | "sunset"
  | "arctic"
  | "emerald"
  | "cleanBlack";
export type GraphicOffSaleMetric = "selectedCategoryItems" | "selectedCategoryCopies" | "graphicItems" | "manual";
export type GraphicCurrencyKind = "usd" | "crypto" | "custom";

export const GRAPHIC_BACKGROUND_OPTIONS: readonly Readonly<{
  id: GraphicBackgroundPreset;
  label: string;
}>[] = Object.freeze([
  Object.freeze({ id: "midnight", label: "Midnight Texture" }),
  Object.freeze({ id: "neonGrid", label: "Neon Grid" }),
  Object.freeze({ id: "royalPurple", label: "Royal Purple" }),
  Object.freeze({ id: "sunset", label: "Sunset Ember" }),
  Object.freeze({ id: "arctic", label: "Arctic Blue" }),
  Object.freeze({ id: "emerald", label: "Emerald Matrix" }),
  Object.freeze({ id: "cleanBlack", label: "Clean Black" }),
]);

export interface GraphicExportDimensions {
  width: number;
  height: number;
}

/** Pixel dimensions used by canvas/image exports, independent of preview size. */
export const GRAPHIC_EXPORT_DIMENSIONS: Readonly<Record<GraphicExportPreset, GraphicExportDimensions>> =
  Object.freeze({
    landscape: Object.freeze({ width: 1920, height: 1080 }),
    square: Object.freeze({ width: 1080, height: 1080 }),
    portrait: Object.freeze({ width: 1080, height: 1350 }),
  });

export interface GraphicDraftItem {
  /** Stable GroupedInventoryItem.key, such as "asset:123". */
  key: string;
  /** User-editable caption rendered below this item. */
  label: string;
}

export interface GraphicFooterCell {
  key: "custom" | "offSale" | "currency" | "selectedItems" | "ownedCopies";
  value: string;
  label: string;
}

export interface GraphicFooterContext {
  selectedCategoryOffSaleItems: number;
  selectedCategoryOffSaleCopies: number;
  /** False while one or more selected inventory categories still need to load. */
  selectedCategoryOffSaleComplete?: boolean;
  graphicOffSaleItems: number;
  selectedGraphicItems: number;
  ownedGraphicCopies: number;
}

export interface GraphicBuilderDraft {
  version: typeof GRAPHIC_DRAFT_VERSION;
  headline: string;
  subheadline: string;
  footer: string;
  footerLabel: string;
  showFooterCustom: boolean;
  showFooterOffSale: boolean;
  footerOffSaleMetric: GraphicOffSaleMetric;
  footerManualOffSaleCount: string;
  showFooterCurrency: boolean;
  footerCurrencyKind: GraphicCurrencyKind;
  footerCurrencyValue: string;
  showFooterSelectedItems: boolean;
  showFooterOwnedCopies: boolean;
  exportPreset: GraphicExportPreset;
  backgroundPreset: GraphicBackgroundPreset;
  showPlayerIdentity: boolean;
  showItemNames: boolean;
  selectedItems: GraphicDraftItem[];
}

export interface SelectableGraphicItem {
  key: string;
  label: string;
}

export type GraphicTextField = "headline" | "subheadline" | "footer";

const MAX_ITEM_KEY_LENGTH = 160;
const MAX_ITEM_LABEL_LENGTH = 120;
const MAX_FOOTER_LABEL_LENGTH = 60;
const MAX_CURRENCY_VALUE_LENGTH = 60;
const MAX_MANUAL_COUNT_LENGTH = 9;
const MAX_TEXT_LENGTH: Readonly<Record<GraphicTextField, number>> = Object.freeze({
  headline: 180,
  subheadline: 240,
  footer: 240,
});

const EXPORT_PRESETS = new Set<GraphicExportPreset>(["landscape", "square", "portrait"]);
const BACKGROUND_PRESETS = new Set<GraphicBackgroundPreset>(GRAPHIC_BACKGROUND_OPTIONS.map(({ id }) => id));
const OFF_SALE_METRICS = new Set<GraphicOffSaleMetric>(["selectedCategoryItems", "selectedCategoryCopies", "graphicItems", "manual"]);
const CURRENCY_KINDS = new Set<GraphicCurrencyKind>(["usd", "crypto", "custom"]);

function truncate(value: string, maximum: number): string {
  return value.length <= maximum ? value : value.slice(0, maximum);
}

function normalizedKey(value: string): string {
  return truncate(value.trim(), MAX_ITEM_KEY_LENGTH);
}

function normalizedLabel(value: string): string {
  return truncate(value, MAX_ITEM_LABEL_LENGTH);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isExportPreset(value: unknown): value is GraphicExportPreset {
  return typeof value === "string" && EXPORT_PRESETS.has(value as GraphicExportPreset);
}

function isBackgroundPreset(value: unknown): value is GraphicBackgroundPreset {
  return typeof value === "string" && BACKGROUND_PRESETS.has(value as GraphicBackgroundPreset);
}

function isOffSaleMetric(value: unknown): value is GraphicOffSaleMetric {
  return typeof value === "string" && OFF_SALE_METRICS.has(value as GraphicOffSaleMetric);
}

function isCurrencyKind(value: unknown): value is GraphicCurrencyKind {
  return typeof value === "string" && CURRENCY_KINDS.has(value as GraphicCurrencyKind);
}

function manualCount(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return /^\d+$/.test(trimmed) ? truncate(trimmed, MAX_MANUAL_COUNT_LENGTH) : "";
}

export function createGraphicDraft(
  values: Partial<Omit<GraphicBuilderDraft, "version" | "selectedItems">> = {},
): GraphicBuilderDraft {
  return {
    version: GRAPHIC_DRAFT_VERSION,
    headline: typeof values.headline === "string" ? truncate(values.headline, MAX_TEXT_LENGTH.headline) : "",
    subheadline: typeof values.subheadline === "string" ? truncate(values.subheadline, MAX_TEXT_LENGTH.subheadline) : "",
    footer: typeof values.footer === "string" ? truncate(values.footer, MAX_TEXT_LENGTH.footer) : "",
    footerLabel: typeof values.footerLabel === "string" ? truncate(values.footerLabel, MAX_FOOTER_LABEL_LENGTH) : "CUSTOM TEXT",
    showFooterCustom: typeof values.showFooterCustom === "boolean" ? values.showFooterCustom : true,
    showFooterOffSale: typeof values.showFooterOffSale === "boolean" ? values.showFooterOffSale : true,
    footerOffSaleMetric: isOffSaleMetric(values.footerOffSaleMetric) ? values.footerOffSaleMetric : "selectedCategoryItems",
    footerManualOffSaleCount: manualCount(values.footerManualOffSaleCount),
    showFooterCurrency: typeof values.showFooterCurrency === "boolean" ? values.showFooterCurrency : false,
    footerCurrencyKind: isCurrencyKind(values.footerCurrencyKind) ? values.footerCurrencyKind : "usd",
    footerCurrencyValue: typeof values.footerCurrencyValue === "string" ? truncate(values.footerCurrencyValue, MAX_CURRENCY_VALUE_LENGTH) : "BTC",
    showFooterSelectedItems: typeof values.showFooterSelectedItems === "boolean" ? values.showFooterSelectedItems : false,
    showFooterOwnedCopies: typeof values.showFooterOwnedCopies === "boolean" ? values.showFooterOwnedCopies : false,
    exportPreset: isExportPreset(values.exportPreset) ? values.exportPreset : "landscape",
    backgroundPreset: isBackgroundPreset(values.backgroundPreset) ? values.backgroundPreset : "midnight",
    showPlayerIdentity: typeof values.showPlayerIdentity === "boolean" ? values.showPlayerIdentity : true,
    showItemNames: typeof values.showItemNames === "boolean" ? values.showItemNames : false,
    selectedItems: [],
  };
}

/** Appends a new item while retaining click order. Existing keys are not duplicated. */
export function selectGraphicItem(
  draft: GraphicBuilderDraft,
  item: SelectableGraphicItem,
  maximum = MAX_GRAPHIC_ITEMS,
): GraphicBuilderDraft {
  const key = normalizedKey(item.key);
  if (!key || draft.selectedItems.some((selected) => selected.key === key)) return draft;
  if (!Number.isSafeInteger(maximum) || maximum < 0) throw new RangeError("Maximum item count must be a non-negative integer.");
  if (draft.selectedItems.length >= maximum) return draft;

  return {
    ...draft,
    selectedItems: [...draft.selectedItems, { key, label: normalizedLabel(item.label) }],
  };
}

export function deselectGraphicItem(draft: GraphicBuilderDraft, itemKey: string): GraphicBuilderDraft {
  const key = normalizedKey(itemKey);
  const selectedItems = draft.selectedItems.filter((item) => item.key !== key);
  return selectedItems.length === draft.selectedItems.length ? draft : { ...draft, selectedItems };
}

export function toggleGraphicItem(
  draft: GraphicBuilderDraft,
  item: SelectableGraphicItem,
  maximum = MAX_GRAPHIC_ITEMS,
): GraphicBuilderDraft {
  const key = normalizedKey(item.key);
  return draft.selectedItems.some((selected) => selected.key === key)
    ? deselectGraphicItem(draft, key)
    : selectGraphicItem(draft, { ...item, key }, maximum);
}

/** Moves an item to a clamped zero-based position without disturbing other items. */
export function moveGraphicItem(
  draft: GraphicBuilderDraft,
  itemKey: string,
  destinationIndex: number,
): GraphicBuilderDraft {
  if (!Number.isFinite(destinationIndex)) return draft;
  const key = normalizedKey(itemKey);
  const currentIndex = draft.selectedItems.findIndex((item) => item.key === key);
  if (currentIndex < 0 || draft.selectedItems.length < 2) return draft;

  const nextIndex = Math.max(0, Math.min(draft.selectedItems.length - 1, Math.trunc(destinationIndex)));
  if (nextIndex === currentIndex) return draft;

  const selectedItems = [...draft.selectedItems];
  const [moved] = selectedItems.splice(currentIndex, 1);
  if (!moved) return draft;
  selectedItems.splice(nextIndex, 0, moved);
  return { ...draft, selectedItems };
}

export function setGraphicItemLabel(
  draft: GraphicBuilderDraft,
  itemKey: string,
  label: string,
): GraphicBuilderDraft {
  const key = normalizedKey(itemKey);
  const nextLabel = normalizedLabel(label);
  const index = draft.selectedItems.findIndex((item) => item.key === key);
  if (index < 0 || draft.selectedItems[index]?.label === nextLabel) return draft;

  const selectedItems = [...draft.selectedItems];
  selectedItems[index] = { ...selectedItems[index]!, label: nextLabel };
  return { ...draft, selectedItems };
}

export function setGraphicText(
  draft: GraphicBuilderDraft,
  field: GraphicTextField,
  value: string,
): GraphicBuilderDraft {
  const nextValue = truncate(value, MAX_TEXT_LENGTH[field]);
  return draft[field] === nextValue ? draft : { ...draft, [field]: nextValue };
}

export function setGraphicExportPreset(
  draft: GraphicBuilderDraft,
  exportPreset: GraphicExportPreset,
): GraphicBuilderDraft {
  return draft.exportPreset === exportPreset ? draft : { ...draft, exportPreset };
}

export function setGraphicBackgroundPreset(
  draft: GraphicBuilderDraft,
  backgroundPreset: GraphicBackgroundPreset,
): GraphicBuilderDraft {
  return draft.backgroundPreset === backgroundPreset ? draft : { ...draft, backgroundPreset };
}

/** Removes selections no longer present in the current inventory, preserving order and labels. */
export function reconcileGraphicItems(
  draft: GraphicBuilderDraft,
  availableItemKeys: Iterable<string>,
): GraphicBuilderDraft {
  const available = new Set(Array.from(availableItemKeys, normalizedKey).filter(Boolean));
  const selectedItems = draft.selectedItems.filter((item) => available.has(item.key));
  return selectedItems.length === draft.selectedItems.length ? draft : { ...draft, selectedItems };
}

export function graphicExportDimensions(preset: GraphicExportPreset): GraphicExportDimensions {
  return GRAPHIC_EXPORT_DIMENSIONS[preset];
}

function boundedCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function formattedCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(boundedCount(value));
}

/** Resolves the enabled bottom-bar blocks without mixing unlike inventory metrics. */
export function graphicFooterCells(
  draft: GraphicBuilderDraft,
  context: GraphicFooterContext,
): GraphicFooterCell[] {
  const cells: GraphicFooterCell[] = [];
  if (draft.showFooterCustom) {
    cells.push({
      key: "custom",
      value: draft.footer.trim() || "INVENTORY LENS",
      label: draft.footerLabel.trim() || "CUSTOM TEXT",
    });
  }
  if (draft.showFooterOffSale) {
    const partialPrefix = context.selectedCategoryOffSaleComplete === false ? "LOADED " : "";
    const resolved = draft.footerOffSaleMetric === "selectedCategoryCopies"
      ? { value: formattedCount(context.selectedCategoryOffSaleCopies), label: `${partialPrefix}OFF-SALE COPIES` }
      : draft.footerOffSaleMetric === "graphicItems"
        ? { value: formattedCount(context.graphicOffSaleItems), label: "OFF-SALE SHOWN" }
        : draft.footerOffSaleMetric === "manual"
          ? { value: draft.footerManualOffSaleCount || "-", label: "OFF-SALE" }
          : { value: formattedCount(context.selectedCategoryOffSaleItems), label: `${partialPrefix}OFF-SALE ITEMS` };
    cells.push({ key: "offSale", ...resolved });
  }
  if (draft.showFooterCurrency) {
    const currencyValue = draft.footerCurrencyValue.trim();
    cells.push({
      key: "currency",
      value: draft.footerCurrencyKind === "usd"
        ? "USD"
        : currencyValue || (draft.footerCurrencyKind === "crypto" ? "CRYPTO" : "PAYMENT"),
      label: draft.footerCurrencyKind === "crypto" ? "CRYPTO ACCEPTED" : "CURRENCY ACCEPTED",
    });
  }
  if (draft.showFooterSelectedItems) {
    cells.push({ key: "selectedItems", value: formattedCount(context.selectedGraphicItems), label: "SELECTED ITEMS" });
  }
  if (draft.showFooterOwnedCopies) {
    cells.push({ key: "ownedCopies", value: formattedCount(context.ownedGraphicCopies), label: "OWNED COPIES" });
  }
  return cells;
}

/** Deterministic grid used by previews and exports for the selected-item panel. */
export function graphicItemGrid(
  itemCount: number,
  panel: "wide" | "portrait" = "wide",
): { columns: number; rows: number } {
  const count = Number.isFinite(itemCount)
    ? Math.max(0, Math.min(MAX_GRAPHIC_ITEMS, Math.trunc(itemCount)))
    : 0;
  if (count === 0) return { columns: 0, rows: 0 };
  const columns = panel === "portrait"
    ? count <= 4 ? 2 : count <= 9 ? 3 : 4
    : count <= 5 ? count : count <= 12 ? 4 : 6;
  return { columns, rows: Math.ceil(count / columns) };
}

function sanitizeSelectedItems(value: unknown): GraphicDraftItem[] {
  if (!Array.isArray(value)) return [];
  const selectedItems: GraphicDraftItem[] = [];
  const seen = new Set<string>();

  for (const candidate of value) {
    if (!isRecord(candidate) || typeof candidate.key !== "string" || typeof candidate.label !== "string") continue;
    const key = normalizedKey(candidate.key);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    selectedItems.push({ key, label: normalizedLabel(candidate.label) });
    if (selectedItems.length === MAX_GRAPHIC_ITEMS) break;
  }

  return selectedItems;
}

function sanitizeDraft(value: unknown): GraphicBuilderDraft | undefined {
  if (!isRecord(value) || value.version !== GRAPHIC_DRAFT_VERSION) return undefined;
  return {
    version: GRAPHIC_DRAFT_VERSION,
    headline: typeof value.headline === "string" ? truncate(value.headline, MAX_TEXT_LENGTH.headline) : "",
    subheadline: typeof value.subheadline === "string" ? truncate(value.subheadline, MAX_TEXT_LENGTH.subheadline) : "",
    footer: typeof value.footer === "string" ? truncate(value.footer, MAX_TEXT_LENGTH.footer) : "",
    footerLabel: typeof value.footerLabel === "string" ? truncate(value.footerLabel, MAX_FOOTER_LABEL_LENGTH) : "CUSTOM TEXT",
    showFooterCustom: typeof value.showFooterCustom === "boolean" ? value.showFooterCustom : true,
    showFooterOffSale: typeof value.showFooterOffSale === "boolean" ? value.showFooterOffSale : true,
    footerOffSaleMetric: isOffSaleMetric(value.footerOffSaleMetric) ? value.footerOffSaleMetric : "selectedCategoryItems",
    footerManualOffSaleCount: manualCount(value.footerManualOffSaleCount),
    showFooterCurrency: typeof value.showFooterCurrency === "boolean" ? value.showFooterCurrency : false,
    footerCurrencyKind: isCurrencyKind(value.footerCurrencyKind) ? value.footerCurrencyKind : "usd",
    footerCurrencyValue: typeof value.footerCurrencyValue === "string" ? truncate(value.footerCurrencyValue, MAX_CURRENCY_VALUE_LENGTH) : "BTC",
    showFooterSelectedItems: typeof value.showFooterSelectedItems === "boolean" ? value.showFooterSelectedItems : false,
    showFooterOwnedCopies: typeof value.showFooterOwnedCopies === "boolean" ? value.showFooterOwnedCopies : false,
    exportPreset: isExportPreset(value.exportPreset) ? value.exportPreset : "landscape",
    backgroundPreset: isBackgroundPreset(value.backgroundPreset) ? value.backgroundPreset : "midnight",
    showPlayerIdentity: typeof value.showPlayerIdentity === "boolean" ? value.showPlayerIdentity : true,
    showItemNames: typeof value.showItemNames === "boolean" ? value.showItemNames : false,
    selectedItems: sanitizeSelectedItems(value.selectedItems),
  };
}

/** Serializes only the stable, non-sensitive builder model in a canonical shape. */
export function serializeGraphicDraft(draft: GraphicBuilderDraft): string {
  const sanitized = sanitizeDraft(draft);
  if (!sanitized) throw new TypeError("Cannot serialize an unsupported graphic draft version.");
  return JSON.stringify(sanitized);
}

/** Returns undefined for malformed JSON or unsupported future/legacy schemas. */
export function deserializeGraphicDraft(serialized: string): GraphicBuilderDraft | undefined {
  try {
    return sanitizeDraft(JSON.parse(serialized) as unknown);
  } catch {
    return undefined;
  }
}
