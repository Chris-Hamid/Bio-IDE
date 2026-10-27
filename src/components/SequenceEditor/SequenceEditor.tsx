/**
 * Virtualized Sequence Editor – Phase 1.1
 *
 * Improvements:
 * - Proper click-drag selection
 * - Feature highlighting (colored underlines + hover labels)
 * - Ctrl/Cmd+C to copy selected sequence
 * - Keyboard navigation (arrows, shift-select)
 * - Better status bar with selection details
 */

import React, {
  useRef,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import type { SequenceRecord, Feature } from "../../types/sequence";
import { clsx } from "clsx";

interface SequenceEditorProps {
  record: SequenceRecord | null;
  onSelectionChange?: (start: number, end: number) => void;
  className?: string;
}

const LINE_HEIGHT = 32;
const BASES_PER_LINE = 60; // slightly tighter for readability + feature space
const BUFFER_LINES = 10;
const RULER_WIDTH = 72; // px for position numbers

const BASE_COLORS: Record<string, string> = {
  A: "text-green-400",
  T: "text-red-400",
  U: "text-red-400",
  G: "text-amber-400",
  C: "text-blue-400",
  N: "text-gray-500",
};

// Simple deterministic color from feature type / id
const FEATURE_COLORS: Record<string, string> = {
  gene: "#22c55e",
  CDS: "#3b82f6",
  promoter: "#a855f7",
  terminator: "#f97316",
  restriction_site: "#ef4444",
  misc_feature: "#94a3b8",
  default: "#64748b",
};

function getBaseColor(base: string): string {
  return BASE_COLORS[base.toUpperCase()] ?? "text-gray-400";
}

function getFeatureColor(feature: Feature): string {
  if (feature.color) return feature.color;
  return FEATURE_COLORS[feature.type] ?? FEATURE_COLORS.default;
}

function getFeatureLabel(feature: Feature): string {
  return (
    (feature.qualifiers?.label as string) ||
    (feature.qualifiers?.gene as string) ||
    (feature.qualifiers?.enzyme as string) ||
    (feature.qualifiers?.product as string) ||
    feature.type
  );
}

export const SequenceEditor: React.FC<SequenceEditorProps> = ({
  record,
  onSelectionChange,
  className,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);

  // Selection state (start/end are 0-based, end is exclusive)
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<number | null>(null);

  // Hovered feature for tooltip
  const [hoveredFeature, setHoveredFeature] = useState<Feature | null>(null);

  const sequence = record?.sequence ?? "";
  const length = sequence.length;
  const totalLines = Math.ceil(length / BASES_PER_LINE) || 1;
  const totalHeight = totalLines * LINE_HEIGHT;

  // ---------- Virtualization ----------
  const visibleRange = useMemo(() => {
    const startLine = Math.max(0, Math.floor(scrollTop / LINE_HEIGHT) - BUFFER_LINES);
    const endLine = Math.min(
      totalLines,
      Math.ceil((scrollTop + viewportHeight) / LINE_HEIGHT) + BUFFER_LINES
    );
    return { startLine, endLine };
  }, [scrollTop, viewportHeight, totalLines]);

  // ---------- Resize observer ----------
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setViewportHeight(entry.contentRect.height);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ---------- Selection helpers ----------
  const updateSelection = useCallback(
    (start: number, end: number) => {
      const s = Math.max(0, Math.min(start, end));
      const e = Math.min(length, Math.max(start, end));
      setSelection({ start: s, end: e });
      onSelectionChange?.(s, e);
    },
    [length, onSelectionChange]
  );

  const clearSelection = useCallback(() => {
    setSelection(null);
    onSelectionChange?.(0, 0);
  }, [onSelectionChange]);

  // ---------- Mouse handlers ----------
  const handleBaseMouseDown = useCallback(
    (pos: number, e: React.MouseEvent) => {
      e.preventDefault();
      dragStartRef.current = pos;
      setIsDragging(true);

      if (e.shiftKey && selection) {
        // Extend existing selection
        updateSelection(selection.start, pos + 1);
      } else {
        updateSelection(pos, pos + 1);
      }
    },
    [selection, updateSelection]
  );

  const handleBaseMouseEnter = useCallback(
    (pos: number) => {
      if (!isDragging || dragStartRef.current === null) return;
      updateSelection(dragStartRef.current, pos + 1);
    },
    [isDragging, updateSelection]
  );

  // Global mouseup to end drag
  useEffect(() => {
    const onUp = () => {
      setIsDragging(false);
      dragStartRef.current = null;
    };
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, []);

  // ---------- Keyboard ----------
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Only handle when editor is focused / no input is active
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }

      // Copy
      if ((e.ctrlKey || e.metaKey) && e.key === "c" && selection) {
        e.preventDefault();
        const text = sequence.slice(selection.start, selection.end);
        navigator.clipboard.writeText(text).then(() => {
          // brief visual feedback could be added later
        });
        return;
      }

      // Select all
      if ((e.ctrlKey || e.metaKey) && e.key === "a") {
        e.preventDefault();
        updateSelection(0, length);
        return;
      }

      // Escape clears selection
      if (e.key === "Escape") {
        clearSelection();
        return;
      }

      // Arrow keys (basic navigation)
      if (!selection) return;

      if (e.key === "ArrowRight") {
        e.preventDefault();
        const newPos = Math.min(length, selection.end);
        if (e.shiftKey) {
          updateSelection(selection.start, newPos + 1);
        } else {
          updateSelection(newPos, newPos + 1);
        }
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        const newPos = Math.max(0, selection.start - 1);
        if (e.shiftKey) {
          updateSelection(newPos, selection.end);
        } else {
          updateSelection(newPos, newPos + 1);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selection, sequence, length, updateSelection, clearSelection]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  // ---------- Visible lines ----------
  const visibleLines = useMemo(() => {
    const lines: {
      lineIndex: number;
      startPos: number;
      text: string;
      features: Feature[];
    }[] = [];

    for (let i = visibleRange.startLine; i < visibleRange.endLine; i++) {
      const startPos = i * BASES_PER_LINE;
      const endPos = Math.min(startPos + BASES_PER_LINE, length);
      const text = sequence.slice(startPos, endPos);

      const lineFeatures =
        record?.features.filter(
          (f) => !(f.location.end <= startPos || f.location.start >= endPos)
        ) ?? [];

      lines.push({ lineIndex: i, startPos, text, features: lineFeatures });
    }
    return lines;
  }, [visibleRange, sequence, length, record?.features]);

  // ---------- Empty state ----------
  if (!record) {
    return (
      <div
        className={clsx(
          "flex items-center justify-center h-full text-gray-500 font-mono",
          className
        )}
      >
        Open a GenBank or FASTA file to begin
      </div>
    );
  }

  const selLen = selection ? Math.abs(selection.end - selection.start) : 0;

  return (
    <div
      className={clsx(
        "relative flex flex-col h-full bg-bio-bg overflow-hidden font-mono text-sm select-none",
        className
      )}
      tabIndex={0} // allow keyboard focus
    >
      {/* Header */}
      <div className="flex items-center gap-4 px-4 py-2 bg-bio-panel border-b border-bio-border text-xs text-gray-400 shrink-0">
        <span className="text-gray-200 font-medium truncate max-w-[240px]">
          {record.name || record.id}
        </span>
        <span>{length.toLocaleString()} bp</span>
        <span className="uppercase">{record.molecule_type}</span>
        {record.circular && (
          <span className="px-1.5 py-0.5 rounded bg-blue-900/40 text-blue-300">
            circular
          </span>
        )}
        <span className="ml-auto">{record.features.length} features</span>
      </div>

      {/* Scrollable viewport */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto relative"
        onScroll={handleScroll}
      >
        <div style={{ height: totalHeight, position: "relative" }}>
          {visibleLines.map((line) => {
            const top = line.lineIndex * LINE_HEIGHT;

            return (
              <div
                key={line.lineIndex}
                className="absolute left-0 right-0 flex flex-col justify-center px-2"
                style={{ top, height: LINE_HEIGHT }}
              >
                <div className="flex items-center">
                  {/* Position ruler */}
                  <div
                    className="shrink-0 text-right pr-3 text-gray-600 text-xs tabular-nums"
                    style={{ width: RULER_WIDTH }}
                  >
                    {(line.startPos + 1).toLocaleString()}
                  </div>

                  {/* Sequence + feature track */}
                  <div className="flex-1 relative">
                    {/* Feature underlines */}
                    <div className="absolute left-0 right-0 bottom-0 h-1.5 pointer-events-none">
                      {line.features.map((f) => {
                        const featStart = Math.max(f.location.start, line.startPos);
                        const featEnd = Math.min(f.location.end, line.startPos + line.text.length);
                        const leftPct =
                          ((featStart - line.startPos) / BASES_PER_LINE) * 100;
                        const widthPct =
                          ((featEnd - featStart) / BASES_PER_LINE) * 100;

                        return (
                          <div
                            key={f.id}
                            className="absolute h-full rounded-sm opacity-80"
                            style={{
                              left: `${leftPct}%`,
                              width: `${widthPct}%`,
                              backgroundColor: getFeatureColor(f),
                            }}
                            title={getFeatureLabel(f)}
                          />
                        );
                      })}
                    </div>

                    {/* Bases */}
                    <div className="tracking-wider whitespace-pre relative z-10">
                      {line.text.split("").map((base, i) => {
                        const pos = line.startPos + i;
                        const isSelected =
                          selection &&
                          pos >= Math.min(selection.start, selection.end) &&
                          pos < Math.max(selection.start, selection.end);

                        // Is this base covered by any feature?
                        const coveringFeatures = line.features.filter(
                          (f) => pos >= f.location.start && pos < f.location.end
                        );

                        return (
                          <span
                            key={i}
                            className={clsx(
                              getBaseColor(base),
                              isSelected && "bg-blue-600/60 text-white",
                              coveringFeatures.length > 0 && "underline decoration-2",
                              "cursor-text hover:bg-white/10 rounded-sm"
                            )}
                            style={
                              coveringFeatures.length > 0
                                ? {
                                    textDecorationColor: getFeatureColor(
                                      coveringFeatures[0]
                                    ),
                                  }
                                : undefined
                            }
                            onMouseDown={(e) => handleBaseMouseDown(pos, e)}
                            onMouseEnter={() => {
                              handleBaseMouseEnter(pos);
                              if (coveringFeatures.length > 0) {
                                setHoveredFeature(coveringFeatures[0]);
                              } else {
                                setHoveredFeature(null);
                              }
                            }}
                            onMouseLeave={() => setHoveredFeature(null)}
                          >
                            {base}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Feature tooltip */}
      {hoveredFeature && (
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-50 px-3 py-1.5 rounded bg-gray-900 border border-bio-border text-xs shadow-lg pointer-events-none">
          <span
            className="inline-block w-2 h-2 rounded-full mr-2"
            style={{ backgroundColor: getFeatureColor(hoveredFeature) }}
          />
          <span className="font-medium text-gray-200">
            {getFeatureLabel(hoveredFeature)}
          </span>
          <span className="text-gray-500 ml-2">
            {hoveredFeature.type} · {hoveredFeature.location.start + 1}–
            {hoveredFeature.location.end}
          </span>
        </div>
      )}

      {/* Status bar */}
      <div className="px-4 py-1.5 bg-bio-panel border-t border-bio-border text-xs text-gray-500 flex gap-4 shrink-0 items-center">
        <span>
          Lines {visibleRange.startLine + 1}–{Math.min(visibleRange.endLine, totalLines)} of{" "}
          {totalLines}
        </span>

        {selection && selLen > 0 ? (
          <span className="text-blue-300">
            Selection: {selection.start + 1}–{selection.end} ({selLen.toLocaleString()} bp)
            <span className="text-gray-600 ml-2">Ctrl+C to copy</span>
          </span>
        ) : (
          <span className="text-gray-600">Click and drag to select · Shift+click to extend</span>
        )}

        {hoveredFeature && (
          <span className="ml-auto text-gray-400">
            {getFeatureLabel(hoveredFeature)}
          </span>
        )}
      </div>
    </div>
  );
};

export default SequenceEditor;
