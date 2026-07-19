import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  createGraphicDraft,
  deselectGraphicItem,
  GRAPHIC_BACKGROUND_OPTIONS,
  GRAPHIC_DESIGN_OPTIONS,
  graphicExportDimensions,
  graphicFooterCells,
  MAX_GRAPHIC_ITEMS,
  moveGraphicItem,
  reconcileGraphicItems,
  selectGraphicItem,
  setGraphicBackgroundPreset,
  setGraphicDesignPreset,
  setGraphicExportPreset,
  setGraphicItemLabel,
  setGraphicText,
  toggleGraphicItem,
  type GraphicBuilderDraft,
  type GraphicBackgroundPreset,
  type GraphicCurrencyKind,
  type GraphicDesignPreset,
  type GraphicExportPreset,
  type GraphicOffSaleMetric,
} from "./lib/graphic-builder";
import {
  downloadCanvasPng,
  graphicFilename,
  loadRobloxGraphicImage,
  renderInventoryGraphic,
  type DecodedGraphicImage,
  type GraphicRenderItem,
} from "./lib/graphic-export";
import type { GroupedInventoryItem, ResolvedUser } from "./lib/types";
import { RobloxHttpClient } from "./lib/http";
import { externalDataFetch } from "./lib/runtime-fetch";
import { fetchUserAvatarThumbnail } from "./lib/users";
import "./graphic-builder.css";

interface GraphicBuilderProps {
  draft: GraphicBuilderDraft;
  items: readonly GroupedInventoryItem[];
  onBack: () => void;
  offSaleSummary?: {
    uniqueItems: number;
    ownedCopies: number;
    complete: boolean;
  };
  setDraft: Dispatch<SetStateAction<GraphicBuilderDraft>>;
  user: ResolvedUser | null;
}

type RenderState = "idle" | "rendering" | "ready" | "error";

const ITEM_PICKER_LIMIT = 80;
const GRAPHIC_HTTP_CLIENT = new RobloxHttpClient({ fetch: externalDataFetch });

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export function defaultGraphicItemLabel(item: GroupedInventoryItem): string {
  if (item.rarity.kind === "officialSupply") {
    return `${formatCount(item.rarity.count)} OFFICIAL SUPPLY`;
  }
  if (item.rarity.kind === "wikiPurchases") {
    return `${formatCount(item.rarity.count)} HISTORICAL PURCHASES`;
  }
  if (item.rarity.kind === "badgeAwards") {
    return `${formatCount(item.rarity.count)} BADGE AWARDS`;
  }
  if (item.giftOrigin?.sourceMetric) {
    return `${formatCount(item.giftOrigin.sourceMetric.count)} GIFT PURCHASES`;
  }
  if (item.collector?.distributionCount) {
    return `${formatCount(item.collector.distributionCount)} HISTORICAL AWARDS`;
  }
  return `×${formatCount(item.copies.length)} OWNED`;
}

function recommendationScore(item: GroupedInventoryItem): number {
  let score = 0;
  if (item.thumbnailUrl) score += 30;
  if (item.saleStatus === "offSale") score += 100;
  if (item.categoryId.startsWith("accessories.")) score += 40;
  if (item.creatorName?.trim().toLocaleLowerCase() === "roblox") score += 15;
  if (item.rarity.kind === "officialSupply") score += 70;
  if (item.rarity.kind === "wikiPurchases") score += 55;
  if (item.giftOrigin?.sourceMetric) score += 50;
  if (item.collector?.tier === "exceptional") score += 90;
  else if (item.collector?.tier === "rare") score += 70;
  else if (item.collector?.tier === "notable") score += 45;
  return score;
}

export function suggestedGraphicItems(
  items: readonly GroupedInventoryItem[],
  maximum = 12,
): GroupedInventoryItem[] {
  return [...items]
    .filter((item) => Boolean(item.thumbnailUrl))
    .sort((a, b) => {
      const scoreDifference = recommendationScore(b) - recommendationScore(a);
      if (scoreDifference) return scoreDifference;
      const aMetric = a.rarity.count ?? Number.POSITIVE_INFINITY;
      const bMetric = b.rarity.count ?? Number.POSITIVE_INFINITY;
      return aMetric - bMetric || a.name.localeCompare(b.name);
    })
    .slice(0, Math.max(0, Math.min(MAX_GRAPHIC_ITEMS, maximum)));
}

function buildStarterDraft(user: ResolvedUser): GraphicBuilderDraft {
  return createGraphicDraft({
    headline: `${user.displayName.toLocaleUpperCase()}'S COLLECTION`,
    subheadline: `@${user.name} · SELECTED ROBLOX ITEMS`,
    footer: "MY ROBLOX COLLECTION",
    exportPreset: "landscape",
  });
}

function withSuggestedItems(
  draft: GraphicBuilderDraft,
  items: readonly GroupedInventoryItem[],
): GraphicBuilderDraft {
  let next: GraphicBuilderDraft = { ...draft, selectedItems: [] };
  for (const item of suggestedGraphicItems(items)) {
    next = selectGraphicItem(next, { key: item.key, label: defaultGraphicItemLabel(item) });
  }
  return next;
}

function GraphicEmptyState({ onBack }: { onBack: () => void }) {
  return (
    <section className="graphic-empty">
      <div className="graphic-empty-mark" aria-hidden="true">✦</div>
      <h1>Scan an inventory first</h1>
      <p>The builder uses the loaded player avatar and item thumbnails, so it needs a completed public inventory scan.</p>
      <button className="button primary" onClick={onBack} type="button">Go to inventory scanner</button>
    </section>
  );
}

export default function GraphicBuilder({ draft, items, onBack, offSaleSummary, setDraft, user }: GraphicBuilderProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const initializedOwnerRef = useRef<string | null>(null);
  const suggestedOwnerRef = useRef<string | null>(null);
  const renderSequenceRef = useRef(0);
  const imageCacheRef = useRef(new Map<string, Promise<DecodedGraphicImage | undefined>>());
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>();
  const [itemQuery, setItemQuery] = useState("");
  const [renderState, setRenderState] = useState<RenderState>("idle");
  const [renderNote, setRenderNote] = useState("");
  const [downloadNote, setDownloadNote] = useState("");

  const inventoryByKey = useMemo(
    () => new Map(items.map((item) => [item.key, item])),
    [items],
  );
  const selectedItems = useMemo(
    () => draft.selectedItems.flatMap((selection) => {
      const item = inventoryByKey.get(selection.key);
      return item ? [{ item, label: selection.label }] : [];
    }),
    [draft.selectedItems, inventoryByKey],
  );
  const selectedKeys = useMemo(
    () => new Set(draft.selectedItems.map((item) => item.key)),
    [draft.selectedItems],
  );
  const pickerItems = useMemo(() => {
    const normalizedQuery = itemQuery.trim().toLocaleLowerCase();
    return [...items]
      .filter((item) => !normalizedQuery || item.name.toLocaleLowerCase().includes(normalizedQuery))
      .sort((a, b) => Number(selectedKeys.has(b.key)) - Number(selectedKeys.has(a.key)) || a.name.localeCompare(b.name));
  }, [itemQuery, items, selectedKeys]);

  useEffect(() => {
    if (!user) return;
    if (initializedOwnerRef.current !== user.id) {
      initializedOwnerRef.current = user.id;
      const hasDraftContent = Boolean(
        draft.headline || draft.subheadline || draft.footer || draft.selectedItems.length,
      );
      suggestedOwnerRef.current = hasDraftContent ? user.id : null;
      imageCacheRef.current.clear();
      setItemQuery("");
      setDownloadNote("");
      if (!hasDraftContent) setDraft(buildStarterDraft(user));
    }
  }, [draft.footer, draft.headline, draft.selectedItems.length, draft.subheadline, setDraft, user]);

  useEffect(() => {
    if (!user || !items.length || suggestedOwnerRef.current === user.id) return;
    suggestedOwnerRef.current = user.id;
    setDraft((current) => withSuggestedItems(current, items));
  }, [items, setDraft, user]);

  useEffect(() => {
    setDraft((current) => reconcileGraphicItems(current, items.map((item) => item.key)));
  }, [items, setDraft]);

  useEffect(() => {
    if (!user) {
      setAvatarUrl(undefined);
      return undefined;
    }
    const controller = new AbortController();
    setAvatarUrl(user.thumbnailUrl);
    void fetchUserAvatarThumbnail(user.id, {
      client: GRAPHIC_HTTP_CLIENT,
      signal: controller.signal,
    }).then((fullAvatarUrl) => {
      if (!controller.signal.aborted && fullAvatarUrl) setAvatarUrl(fullAvatarUrl);
    }).catch(() => undefined);
    return () => controller.abort();
  }, [user]);

  const renderItems = useMemo<GraphicRenderItem[]>(
    () => selectedItems.map(({ item, label }) => ({
      key: item.key,
      name: item.name,
      label,
      thumbnailUrl: item.thumbnailUrl,
      copies: item.copies.length,
      offSale: item.saleStatus === "offSale",
    })),
    [selectedItems],
  );
  const resolvedOffSaleSummary = useMemo(() => {
    if (offSaleSummary) return offSaleSummary;
    const offSaleItems = items.filter((item) => item.saleStatus === "offSale");
    return {
      uniqueItems: offSaleItems.length,
      ownedCopies: offSaleItems.reduce((total, item) => total + item.copies.length, 0),
      complete: true,
    };
  }, [items, offSaleSummary]);
  const footerCells = useMemo(() => graphicFooterCells(draft, {
    selectedCategoryOffSaleItems: resolvedOffSaleSummary.uniqueItems,
    selectedCategoryOffSaleCopies: resolvedOffSaleSummary.ownedCopies,
    selectedCategoryOffSaleComplete: resolvedOffSaleSummary.complete,
    graphicOffSaleItems: renderItems.filter((item) => item.offSale).length,
    selectedGraphicItems: renderItems.length,
    ownedGraphicCopies: renderItems.reduce((total, item) => total + item.copies, 0),
  }), [draft, renderItems, resolvedOffSaleSummary]);

  useEffect(() => {
    if (!user || !canvasRef.current) return;
    const sequence = ++renderSequenceRef.current;
    const previewCanvas = canvasRef.current;
    let cancelled = false;
    setRenderState("rendering");
    setRenderNote("Rendering preview…");
    const activeImageUrls = new Set([
      avatarUrl,
      ...renderItems.map((item) => item.thumbnailUrl),
    ].filter((url): url is string => Boolean(url)));
    for (const cachedUrl of imageCacheRef.current.keys()) {
      if (!activeImageUrls.has(cachedUrl)) imageCacheRef.current.delete(cachedUrl);
    }
    const loadImage = (url: string) => {
      const existing = imageCacheRef.current.get(url);
      if (existing) return existing;
      const pending = loadRobloxGraphicImage(url).then((image) => {
        if (!image && imageCacheRef.current.get(url) === pending) imageCacheRef.current.delete(url);
        return image;
      }, (error: unknown) => {
        if (imageCacheRef.current.get(url) === pending) imageCacheRef.current.delete(url);
        throw error;
      });
      imageCacheRef.current.set(url, pending);
      return pending;
    };
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      const renderCanvas = document.createElement("canvas");
      void renderInventoryGraphic(renderCanvas, {
        dimensions: graphicExportDimensions(draft.exportPreset),
        backgroundPreset: draft.backgroundPreset,
        designPreset: draft.designPreset,
        headline: draft.headline,
        subheadline: draft.subheadline,
        footerCells,
        username: user.name,
        displayName: user.displayName,
        avatarUrl,
        showPlayerIdentity: draft.showPlayerIdentity,
        showItemNames: draft.showItemNames,
        items: renderItems,
      }, loadImage).then(({ missingImages }) => {
        if (cancelled || renderSequenceRef.current !== sequence) return;
        previewCanvas.width = renderCanvas.width;
        previewCanvas.height = renderCanvas.height;
        const previewContext = previewCanvas.getContext("2d", { alpha: false });
        if (!previewContext) throw new Error("This browser could not create the graphic preview.");
        previewContext.drawImage(renderCanvas, 0, 0);
        setRenderState("ready");
        setRenderNote(missingImages ? `${missingImages} image${missingImages === 1 ? "" : "s"} unavailable; placeholders were used.` : "Preview ready");
      }).catch((error) => {
        if (cancelled || renderSequenceRef.current !== sequence) return;
        setRenderState("error");
        setRenderNote(error instanceof Error ? error.message : "Could not render the preview.");
      });
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [avatarUrl, draft.backgroundPreset, draft.designPreset, draft.exportPreset, draft.headline, draft.showItemNames, draft.showPlayerIdentity, draft.subheadline, footerCells, renderItems, user]);

  if (!user) return <GraphicEmptyState onBack={onBack} />;

  const updateText = (field: "headline" | "subheadline" | "footer", value: string) => {
    setDraft((current) => setGraphicText(current, field, value));
  };
  const chooseSuggested = () => setDraft((current) => withSuggestedItems(current, items));

  const handleDownload = async () => {
    const canvas = canvasRef.current;
    if (!canvas || renderState !== "ready") return;
    setDownloadNote("Preparing PNG…");
    try {
      await downloadCanvasPng(canvas, graphicFilename(draft.showPlayerIdentity ? user.name : "collection", draft.exportPreset));
      setDownloadNote("PNG downloaded.");
    } catch (error) {
      setDownloadNote(error instanceof Error ? error.message : "Could not download the PNG.");
    }
  };

  return (
    <section className="graphic-page" aria-labelledby="graphic-builder-title">
      <header className="graphic-page-heading">
        <div>
          <button className="graphic-back" onClick={onBack} type="button">← Inventory</button>
          <span className="section-kicker">Create & export</span>
          <h1 id="graphic-builder-title">Graphic Builder</h1>
          <p>Choose inventory items, replace any wording, and let Inventory Lens handle the layout and borders.</p>
        </div>
        <div className="graphic-heading-actions">
          <span>{draft.selectedItems.length}/{MAX_GRAPHIC_ITEMS} items</span>
          <button
            className="button primary"
            disabled={renderState !== "ready"}
            onClick={() => void handleDownload()}
            type="button"
          >Download PNG</button>
        </div>
      </header>

      <div className="graphic-workspace">
        <aside className="graphic-controls" aria-label="Graphic controls">
          <section className="graphic-control-section">
            <div className="graphic-control-heading"><strong>Text</strong><span>Everything is editable</span></div>
            <label>
              <span>Headline</span>
              <input maxLength={180} onChange={(event) => updateText("headline", event.target.value)} value={draft.headline} />
            </label>
            <label>
              <span>Subtitle</span>
              <input maxLength={240} onChange={(event) => updateText("subheadline", event.target.value)} value={draft.subheadline} />
            </label>
          </section>

          <section className="graphic-control-section graphic-output-controls">
            <div className="graphic-control-heading"><strong>Design</strong><span>Four distinct compositions</span></div>
            <fieldset className="graphic-design-picker">
              <legend>Graphic design</legend>
              <div className="graphic-design-grid">
                {GRAPHIC_DESIGN_OPTIONS.map((option) => (
                  <label className={`graphic-design-option${draft.designPreset === option.id ? " selected" : ""}`} key={option.id}>
                    <input
                      checked={draft.designPreset === option.id}
                      name="graphic-design"
                      onChange={() => setDraft((current) => setGraphicDesignPreset(current, option.id as GraphicDesignPreset))}
                      type="radio"
                      value={option.id}
                    />
                    <span aria-hidden="true" className={`graphic-design-mini design-${option.id}`}>
                      <i className="mini-head" />
                      <i className="mini-avatar" />
                      <i className="mini-items"><b /><b /><b /><b /></i>
                    </span>
                    <span className="graphic-design-copy">
                      <strong>{option.label}</strong>
                      <small>{option.description}</small>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="graphic-format-divider" />
            <div className="graphic-control-heading"><strong>Format</strong><span>High-resolution PNG</span></div>
            <label>
              <span>Canvas</span>
              <select
                onChange={(event) => setDraft((current) => setGraphicExportPreset(current, event.target.value as GraphicExportPreset))}
                value={draft.exportPreset}
              >
                <option value="landscape">Landscape · 1920 × 1080</option>
                <option value="square">Square · 1080 × 1080</option>
                <option value="portrait">Portrait · 1080 × 1350</option>
              </select>
            </label>
            <label>
              <span>Background</span>
              <select
                aria-label="Graphic background"
                onChange={(event) => setDraft((current) => setGraphicBackgroundPreset(
                  current,
                  event.target.value as GraphicBackgroundPreset,
                ))}
                value={draft.backgroundPreset}
              >
                {GRAPHIC_BACKGROUND_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="graphic-check-row">
              <input
                checked={draft.showPlayerIdentity}
                onChange={(event) => setDraft((current) => ({ ...current, showPlayerIdentity: event.target.checked }))}
                type="checkbox"
              />
              <span>Show display name and @username beneath avatar</span>
            </label>
            <label className="graphic-check-row">
              <input
                checked={draft.showItemNames}
                onChange={(event) => setDraft((current) => ({ ...current, showItemNames: event.target.checked }))}
                type="checkbox"
              />
              <span>Show item names above captions</span>
            </label>
          </section>

          <section className="graphic-control-section graphic-footer-controls">
            <div className="graphic-control-heading"><strong>Stats &amp; footer</strong><span>Choose what appears</span></div>

            <div className="graphic-footer-block">
              <label className="graphic-check-row">
                <input
                  checked={draft.showFooterCustom}
                  onChange={(event) => setDraft((current) => ({ ...current, showFooterCustom: event.target.checked }))}
                  type="checkbox"
                />
                <span>Custom text</span>
              </label>
              {draft.showFooterCustom ? (
                <div className="graphic-footer-fields">
                  <label>
                    <span>Footer text</span>
                    <input
                      aria-label="Custom text value"
                      maxLength={240}
                      onChange={(event) => updateText("footer", event.target.value)}
                      type="text"
                      value={draft.footer}
                    />
                  </label>
                  <label>
                    <span>Label beneath value</span>
                    <input
                      aria-label="Custom text label"
                      maxLength={60}
                      onChange={(event) => setDraft((current) => ({ ...current, footerLabel: event.target.value }))}
                      placeholder="CUSTOM TEXT"
                      type="text"
                      value={draft.footerLabel}
                    />
                  </label>
                </div>
              ) : null}
            </div>

            <div className="graphic-footer-block">
              <label className="graphic-check-row">
                <input
                  checked={draft.showFooterOffSale}
                  onChange={(event) => setDraft((current) => ({ ...current, showFooterOffSale: event.target.checked }))}
                  type="checkbox"
                />
                <span>Off-sale total</span>
              </label>
              {draft.showFooterOffSale ? (
                <div className="graphic-footer-fields">
                  <label>
                    <span>Count to show</span>
                    <select
                      aria-label="Off-sale total source"
                      onChange={(event) => setDraft((current) => ({
                        ...current,
                        footerOffSaleMetric: event.target.value as GraphicOffSaleMetric,
                      }))}
                      value={draft.footerOffSaleMetric}
                    >
                      <option value="selectedCategoryItems">Off-sale items · selected categories</option>
                      <option value="selectedCategoryCopies">Off-sale copies · selected categories</option>
                      <option value="graphicItems">Off-sale items · graphic only</option>
                      <option value="manual">Enter a number manually</option>
                    </select>
                  </label>
                  {draft.footerOffSaleMetric === "manual" ? (
                    <label>
                      <span>Off-sale number</span>
                      <input
                        aria-label="Manual off-sale count"
                        inputMode="numeric"
                        maxLength={9}
                        onChange={(event) => setDraft((current) => ({
                          ...current,
                          footerManualOffSaleCount: event.target.value.replace(/\D/g, "").slice(0, 9),
                        }))}
                        placeholder="140"
                        type="text"
                        value={draft.footerManualOffSaleCount}
                      />
                    </label>
                  ) : null}
                  {draft.footerOffSaleMetric.startsWith("selectedCategory") ? (
                    <small className={`graphic-helper-note${resolvedOffSaleSummary.complete ? "" : " warning"}`}>
                      {formatCount(resolvedOffSaleSummary.uniqueItems)} off-sale items · {formatCount(resolvedOffSaleSummary.ownedCopies)} copies in the categories selected on the Inventory page.
                      {resolvedOffSaleSummary.complete ? "" : " Some selected categories are not loaded yet, so this total can increase."}
                    </small>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="graphic-footer-block">
              <label className="graphic-check-row">
                <input
                  checked={draft.showFooterCurrency}
                  onChange={(event) => setDraft((current) => ({ ...current, showFooterCurrency: event.target.checked }))}
                  type="checkbox"
                />
                <span>Currency accepted</span>
              </label>
              {draft.showFooterCurrency ? (
                <div className="graphic-footer-fields">
                  <label>
                    <span>Currency type</span>
                    <select
                      aria-label="Accepted currency type"
                      onChange={(event) => setDraft((current) => ({
                        ...current,
                        footerCurrencyKind: event.target.value as GraphicCurrencyKind,
                      }))}
                      value={draft.footerCurrencyKind}
                    >
                      <option value="usd">USD</option>
                      <option value="crypto">Crypto</option>
                      <option value="custom">Custom</option>
                    </select>
                  </label>
                  {draft.footerCurrencyKind !== "usd" ? (
                    <label>
                      <span>{draft.footerCurrencyKind === "crypto" ? "Crypto names or tickers" : "Currency text"}</span>
                      <input
                        aria-label="Accepted currency value"
                        maxLength={60}
                        onChange={(event) => setDraft((current) => ({ ...current, footerCurrencyValue: event.target.value }))}
                        placeholder={draft.footerCurrencyKind === "crypto" ? "BTC / ETH / USDC" : "Enter currency"}
                        type="text"
                        value={draft.footerCurrencyValue}
                      />
                    </label>
                  ) : null}
                  <small className="graphic-helper-note">Display text only. Inventory Lens does not process payments.</small>
                </div>
              ) : null}
            </div>

            <div className="graphic-footer-optional">
              <label className="graphic-check-row">
                <input
                  checked={draft.showFooterSelectedItems}
                  onChange={(event) => setDraft((current) => ({ ...current, showFooterSelectedItems: event.target.checked }))}
                  type="checkbox"
                />
                <span>Selected items in graphic</span>
              </label>
              <label className="graphic-check-row">
                <input
                  checked={draft.showFooterOwnedCopies}
                  onChange={(event) => setDraft((current) => ({ ...current, showFooterOwnedCopies: event.target.checked }))}
                  type="checkbox"
                />
                <span>Owned copies in graphic</span>
              </label>
            </div>
          </section>

          <section className="graphic-control-section">
            <div className="graphic-control-heading">
              <strong>Choose items</strong>
              <span>{draft.selectedItems.length} selected</span>
            </div>
            <div className="graphic-quick-actions">
              <button className="button secondary" disabled={!items.length} onClick={chooseSuggested} type="button">Suggested rare/off-sale</button>
              <button className="button ghost" disabled={!draft.selectedItems.length} onClick={() => setDraft((current) => ({ ...current, selectedItems: [] }))} type="button">Clear</button>
            </div>
            <label>
              <span>Find a hat or item</span>
              <input onChange={(event) => setItemQuery(event.target.value)} placeholder="Search loaded inventory" type="search" value={itemQuery} />
            </label>
            <div className="graphic-picker" aria-label="Available inventory items">
              {pickerItems.slice(0, ITEM_PICKER_LIMIT).map((item) => {
                const checked = selectedKeys.has(item.key);
                return (
                  <label className={`graphic-picker-row${checked ? " selected" : ""}`} key={item.key}>
                    <input
                      checked={checked}
                      disabled={!checked && draft.selectedItems.length >= MAX_GRAPHIC_ITEMS}
                      onChange={() => setDraft((current) => toggleGraphicItem(current, {
                        key: item.key,
                        label: defaultGraphicItemLabel(item),
                      }))}
                      type="checkbox"
                    />
                    <span className="graphic-picker-thumb">
                      {item.thumbnailUrl ? <img alt="" loading="lazy" src={item.thumbnailUrl} /> : <span aria-hidden="true">◇</span>}
                    </span>
                    <span><strong>{item.name}</strong><small>{item.saleStatus === "offSale" ? "Off-sale · " : ""}{formatCount(item.copies.length)} owned</small></span>
                  </label>
                );
              })}
              {!pickerItems.length ? <p className="graphic-picker-empty">No loaded items match that search.</p> : null}
            </div>
            {pickerItems.length > ITEM_PICKER_LIMIT ? <small className="graphic-picker-note">Showing the first {ITEM_PICKER_LIMIT}. Search by name to find the rest.</small> : null}
          </section>

          {selectedItems.length ? (
            <section className="graphic-control-section">
              <div className="graphic-control-heading"><strong>Captions & order</strong><span>Type anything</span></div>
              <div className="graphic-selected-list">
                {selectedItems.map(({ item, label }, index) => (
                  <div className="graphic-selected-row" key={item.key}>
                    <span className="graphic-selected-index">{index + 1}</span>
                    <label>
                      <span>{item.name}</span>
                      <input
                        aria-label={`Caption for ${item.name}`}
                        maxLength={120}
                        onChange={(event) => setDraft((current) => setGraphicItemLabel(current, item.key, event.target.value))}
                        value={label}
                      />
                    </label>
                    <div className="graphic-order-buttons">
                      <button aria-label={`Move ${item.name} earlier`} disabled={index === 0} onClick={() => setDraft((current) => moveGraphicItem(current, item.key, index - 1))} type="button">↑</button>
                      <button aria-label={`Move ${item.name} later`} disabled={index === selectedItems.length - 1} onClick={() => setDraft((current) => moveGraphicItem(current, item.key, index + 1))} type="button">↓</button>
                      <button aria-label={`Remove ${item.name}`} onClick={() => setDraft((current) => deselectGraphicItem(current, item.key))} type="button">×</button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </aside>

        <section className="graphic-preview-panel" aria-label="Graphic preview">
          <div className="graphic-preview-toolbar">
            <div><strong>Live preview</strong><span>{graphicExportDimensions(draft.exportPreset).width} × {graphicExportDimensions(draft.exportPreset).height}</span></div>
            <span aria-live="polite" className={`graphic-render-status ${renderState}`}>{renderNote}</span>
          </div>
          <div className={`graphic-canvas-frame preset-${draft.exportPreset}`}>
            <canvas
              aria-label={draft.showPlayerIdentity ? `Collection graphic preview for ${user.displayName}` : "Collection graphic preview"}
              ref={canvasRef}
              role="img"
            />
          </div>
          <div className="graphic-preview-footer">
            <p>Automatic captions keep official supply, historical purchases, awards, and your owned copies distinct. Your custom wording is rendered exactly as entered.</p>
            <div>
              <span aria-live="polite">{downloadNote}</span>
              <button className="button primary" disabled={renderState !== "ready"} onClick={() => void handleDownload()} type="button">Download PNG</button>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}
