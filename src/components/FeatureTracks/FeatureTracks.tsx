/**
 * Gene / Feature Browser Tracks
 *
 * Horizontal track view of annotations (genes, CDS, promoters,
 * restriction sites, etc.) synchronized with the sequence.
 */

import React, { useMemo, useState, useRef, useEffect, useCallback } from "react";
import type { SequenceRecord, Feature } from "../../types/sequence";
import { clsx } from "clsx";

interface FeatureTracksProps {
  record: SequenceRecord;
  selection?: { start: number; end: number } | null;
  onFeatureClick?: (feature: Feature) => void;
  onRangeSelect?: (start: number, end: number) => void;
  className?: string;
}

const FEATURE_COLORS: Record<string, string> = {
  gene: "#22c55e",
  CDS: "#3b82f6",
  mRNA: "#06b6d4",
  exon: "#0ea5e9",
  intron: "#64748b",
  promoter: "#a855f7",
  terminator: "#f97316",
  restriction_site: "#ef4444",
  misc_feature: "#94a3b8",
  source: "#475569",
  regulatory: "#d946ef",
  tRNA: "#14b8a6",
  rRNA: "#10b981",
  default: "#64748b",
};

const TRACK_HEIGHT = 22;
const TRACK_GAP = 4;
const LABEL_WIDTH = 110;
const RULER_HEIGHT = 28;

function getFeatureColor(f: Feature): string {
  if (f.color) return f.color;
  return FEATURE_COLORS[f.type] ?? FEATURE_COLORS.default;
}

function getFeatureLabel(f: Feature): string {
  return (
    (f.qualifiers?.label as string) ||
    (f.qualifiers?.gene as string) ||
    (f.qualifiers?.enzyme as string) ||
    (f.qualifiers?.product as string) ||
    (f.qualifiers?.note as string) ||
    f.id ||
    f.type
  );
}

/** Group features into non-overlapping rows (simple packing) */
function packTracks(features: Feature[]): Feature[][] {
  const sorted = [...features].sort(
    (a, b) => a.location.start - b.location.start || b.location.end - a.location.end
  );

  const rows: Feature[][] = [];

  for (const feat of sorted) {
    let placed = false;
    for (const row of rows) {
      const last = row[row.length - 1];
      if (last.location.end <= feat.location.start) {
        row.push(feat);
        placed = true;
        break;
      }
    }
    if (!placed) {
      rows.push([feat]);
    }
  }
  return rows;
}

export const FeatureTracks: React.FC<FeatureTracksProps> = ({
  record,
  selection,
  onFeatureClick,
  onRangeSelect,
  className,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [hovered, setHovered] = useState<Feature | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [scrollLeft, setScrollLeft] = useState(0);

  const length = record.sequence.length;

  // Resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const plotWidth = Math.max(200, width - LABEL_WIDTH - 16);

  // Scale: pixels per base
  const scale = plotWidth / length;

  // Unique feature types for filter
  const featureTypes = useMemo(() => {
    const types = new Set(record.features.map((f) => f.type));
    return ["all", ...Array.from(types).sort()];
  }, [record.features]);

  // Filtered + packed features
  const packedRows = useMemo(() => {
    const filtered =
      filter === "all"
        ? record.features
        : record.features.filter((f) => f.type === filter);
    return packTracks(filtered);
  }, [record.features, filter]);

  const totalTrackHeight =
    RULER_HEIGHT + packedRows.length * (TRACK_HEIGHT + TRACK_GAP) + 12;

  // Ruler ticks
  const ticks = useMemo(() => {
    const niceSteps = [100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];
    let step = niceSteps[0];
    for (const s of niceSteps) {
      if ((s * scale) > 60) {
        step = s;
        break;
      }
      step = s;
    }
    const t: number[] = [];
    for (let p = 0; p <= length; p += step) t.push(p);
    return t;
  }, [length, scale]);

  const handleTrackClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!onRangeSelect) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const pos = Math.floor(x / scale);
      // Simple click → select ~50 bp around click
      const start = Math.max(0, pos - 25);
      const end = Math.min(length, pos + 25);
      onRangeSelect(start, end);
    },
    [scale, length, onRangeSelect]
  );

  if (record.features.length === 0) {
    return (
      <div
        className={clsx(
          "flex items-center justify-center h-24 text-gray-500 text-sm border-t border-bio-border",
          className
        )}
      >
        No features annotated — try “Restriction Sites” or load a GenBank file
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={clsx(
        "flex flex-col border-t border-bio-border bg-bio-bg shrink-0",
        className
      )}
      style={{ minHeight: Math.min(totalTrackHeight, 280) }}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-3 py-1.5 border-b border-bio-border text-xs shrink-0">
        <span className="text-gray-400 font-medium">Feature Tracks</span>
        <span className="text-gray-600">
          {record.features.length} total
        </span>

        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="ml-2 px-2 py-0.5 rounded bg-bio-panel border border-bio-border text-xs text-gray-300 focus:outline-none"
        >
          {featureTypes.map((t) => (
            <option key={t} value={t}>
              {t === "all" ? "All types" : t}
            </option>
          ))}
        </select>

        {hovered && (
          <span className="ml-auto text-gray-400 truncate max-w-md">
            <span
              className="inline-block w-2 h-2 rounded-full mr-1.5"
              style={{ backgroundColor: getFeatureColor(hovered) }}
            />
            {getFeatureLabel(hovered)} · {hovered.type} ·{" "}
            {hovered.location.start + 1}–{hovered.location.end} (
            {hovered.location.end - hovered.location.start} bp)
          </span>
        )}
      </div>

      {/* Tracks area */}
      <div className="flex-1 overflow-auto relative">
        <div
          className="relative"
          style={{ height: totalTrackHeight, minWidth: width }}
        >
          {/* Ruler */}
          <div
            className="absolute top-0 left-0 right-0 flex"
            style={{ height: RULER_HEIGHT }}
          >
            <div
              className="shrink-0 text-gray-600 text-[10px] flex items-end justify-end pr-2 pb-1"
              style={{ width: LABEL_WIDTH }}
            >
              Position
            </div>
            <div className="relative flex-1" style={{ width: plotWidth }}>
              {/* Selection highlight on ruler */}
              {selection && selection.end > selection.start && (
                <div
                  className="absolute top-0 bottom-0 bg-blue-500/20 border-x border-blue-500/40"
                  style={{
                    left: selection.start * scale,
                    width: (selection.end - selection.start) * scale,
                  }}
                />
              )}
              {ticks.map((pos) => (
                <div
                  key={pos}
                  className="absolute bottom-0 flex flex-col items-center"
                  style={{ left: pos * scale, transform: "translateX(-50%)" }}
                >
                  <span className="text-[10px] text-gray-500 font-mono mb-0.5">
                    {pos === 0 ? "0" : pos >= 1000 ? `${(pos / 1000).toFixed(pos % 1000 === 0 ? 0 : 1)}k` : pos}
                  </span>
                  <div className="w-px h-2 bg-gray-600" />
                </div>
              ))}
            </div>
          </div>

          {/* Feature rows */}
          {packedRows.map((row, rowIdx) => (
            <div
              key={rowIdx}
              className="absolute left-0 right-0 flex items-center"
              style={{
                top: RULER_HEIGHT + rowIdx * (TRACK_HEIGHT + TRACK_GAP),
                height: TRACK_HEIGHT,
              }}
            >
              {/* Track label */}
              <div
                className="shrink-0 text-[10px] text-gray-500 pr-2 truncate text-right"
                style={{ width: LABEL_WIDTH }}
              >
                {rowIdx === 0 ? "Features" : ""}
              </div>

              {/* Track canvas */}
              <div
                className="relative flex-1 h-full cursor-crosshair"
                style={{ width: plotWidth }}
                onClick={handleTrackClick}
              >
                {/* Background line */}
                <div className="absolute left-0 right-0 top-1/2 h-px bg-bio-border/60" />

                {/* Selection highlight */}
                {selection && selection.end > selection.start && (
                  <div
                    className="absolute top-0 bottom-0 bg-blue-500/15"
                    style={{
                      left: selection.start * scale,
                      width: (selection.end - selection.start) * scale,
                    }}
                  />
                )}

                {/* Features */}
                {row.map((f) => {
                  const left = f.location.start * scale;
                  const w = Math.max(2, (f.location.end - f.location.start) * scale);
                  const isHovered = hovered?.id === f.id;
                  const color = getFeatureColor(f);

                  return (
                    <div
                      key={f.id}
                      className={clsx(
                        "absolute top-1 bottom-1 rounded-sm cursor-pointer transition-all border",
                        isHovered ? "brightness-125 z-10" : "opacity-90"
                      )}
                      style={{
                        left,
                        width: w,
                        backgroundColor: color,
                        borderColor: isHovered ? "#fff" : "transparent",
                        minWidth: 2,
                      }}
                      title={`${getFeatureLabel(f)} (${f.type})\n${f.location.start + 1}–${f.location.end}`}
                      onMouseEnter={() => setHovered(f)}
                      onMouseLeave={() => setHovered(null)}
                      onClick={(e) => {
                        e.stopPropagation();
                        onFeatureClick?.(f);
                      }}
                    >
                      {/* Label inside bar if wide enough */}
                      {w > 40 && (
                        <span className="absolute inset-0 flex items-center px-1 text-[9px] text-white font-medium truncate pointer-events-none">
                          {getFeatureLabel(f)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default FeatureTracks;
