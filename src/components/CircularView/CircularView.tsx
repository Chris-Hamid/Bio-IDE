/**
 * Circular plasmid / genome map view
 *
 * Renders the sequence as a circle with features drawn as arcs.
 * Optimized for plasmids and small-to-medium circular molecules.
 */

import React, { useMemo, useRef, useState, useEffect } from "react";
import type { SequenceRecord, Feature } from "../../types/sequence";
import { clsx } from "clsx";

interface CircularViewProps {
  record: SequenceRecord;
  className?: string;
  onFeatureClick?: (feature: Feature) => void;
}

const FEATURE_COLORS: Record<string, string> = {
  gene: "#22c55e",
  CDS: "#3b82f6",
  promoter: "#a855f7",
  terminator: "#f97316",
  restriction_site: "#ef4444",
  misc_feature: "#94a3b8",
  source: "#64748b",
  default: "#64748b",
};

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
    f.type
  );
}

/** Convert sequence position → angle in radians (0 at top, clockwise) */
function posToAngle(pos: number, length: number): number {
  return (pos / length) * 2 * Math.PI - Math.PI / 2;
}

function polarToCartesian(
  cx: number,
  cy: number,
  r: number,
  angleRad: number
): { x: number; y: number } {
  return {
    x: cx + r * Math.cos(angleRad),
    y: cy + r * Math.sin(angleRad),
  };
}

/** SVG arc path from startPos to endPos */
function describeArc(
  cx: number,
  cy: number,
  r: number,
  startPos: number,
  endPos: number,
  length: number
): string {
  const startAngle = posToAngle(startPos, length);
  const endAngle = posToAngle(endPos, length);

  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);

  // Large arc flag
  let delta = endAngle - startAngle;
  if (delta < 0) delta += 2 * Math.PI;
  const largeArc = delta > Math.PI ? 1 : 0;

  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

export const CircularView: React.FC<CircularViewProps> = ({
  record,
  className,
  onFeatureClick,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(480);
  const [hovered, setHovered] = useState<Feature | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const s = Math.min(entry.contentRect.width, entry.contentRect.height);
        setSize(Math.max(280, Math.floor(s)));
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const length = record.sequence.length;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size * 0.42;
  const backboneR = size * 0.38;
  const featureR = size * 0.34;

  // Tick marks every ~10% or every 1000 bp (whichever is nicer)
  const tickStep = length > 10000 ? 5000 : length > 2000 ? 1000 : 500;
  const ticks = useMemo(() => {
    const t: number[] = [];
    for (let p = 0; p < length; p += tickStep) t.push(p);
    return t;
  }, [length, tickStep]);

  // Only draw features that are reasonably sized (skip tiny ones for clarity)
  const drawableFeatures = useMemo(() => {
    return record.features.filter((f) => {
      const len = f.location.end - f.location.start;
      // Always show restriction sites and named features
      if (f.type === "restriction_site") return true;
      if (len >= Math.max(10, length * 0.002)) return true;
      return false;
    });
  }, [record.features, length]);

  return (
    <div
      ref={containerRef}
      className={clsx(
        "relative flex items-center justify-center w-full h-full bg-bio-bg overflow-hidden",
        className
      )}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="select-none"
      >
        {/* Background circle */}
        <circle
          cx={cx}
          cy={cy}
          r={outerR + 8}
          fill="none"
          stroke="#1e293b"
          strokeWidth={1}
        />

        {/* Main backbone */}
        <circle
          cx={cx}
          cy={cy}
          r={backboneR}
          fill="none"
          stroke="#334155"
          strokeWidth={6}
        />

        {/* Tick marks + labels */}
        {ticks.map((pos) => {
          const angle = posToAngle(pos, length);
          const inner = polarToCartesian(cx, cy, backboneR - 6, angle);
          const outer = polarToCartesian(cx, cy, backboneR + 10, angle);
          const labelPos = polarToCartesian(cx, cy, backboneR + 22, angle);

          return (
            <g key={pos}>
              <line
                x1={inner.x}
                y1={inner.y}
                x2={outer.x}
                y2={outer.y}
                stroke="#64748b"
                strokeWidth={1.5}
              />
              <text
                x={labelPos.x}
                y={labelPos.y}
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-gray-500 text-[10px] font-mono"
              >
                {pos === 0 ? "0" : pos.toLocaleString()}
              </text>
            </g>
          );
        })}

        {/* Features as arcs */}
        {drawableFeatures.map((f) => {
          const start = f.location.start;
          let end = f.location.end;
          // Handle features that wrap around origin (rare in MVP)
          if (end <= start) end = length;

          const color = getFeatureColor(f);
          const isHovered = hovered?.id === f.id;
          const strokeW = f.type === "restriction_site" ? 3 : isHovered ? 10 : 7;

          const path = describeArc(cx, cy, featureR, start, end, length);

          return (
            <path
              key={f.id}
              d={path}
              fill="none"
              stroke={color}
              strokeWidth={strokeW}
              strokeLinecap="round"
              opacity={isHovered ? 1 : 0.85}
              className="cursor-pointer transition-all"
              onMouseEnter={() => setHovered(f)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => onFeatureClick?.(f)}
            >
              <title>
                {getFeatureLabel(f)} ({f.type}) {start + 1}–{end}
              </title>
            </path>
          );
        })}

        {/* Center label */}
        <text
          x={cx}
          y={cy - 12}
          textAnchor="middle"
          className="fill-gray-200 text-sm font-medium"
        >
          {record.name || record.id}
        </text>
        <text
          x={cx}
          y={cy + 8}
          textAnchor="middle"
          className="fill-gray-500 text-xs font-mono"
        >
          {length.toLocaleString()} bp
        </text>
        {record.circular && (
          <text
            x={cx}
            y={cy + 24}
            textAnchor="middle"
            className="fill-blue-400 text-[10px]"
          >
            circular
          </text>
        )}
      </svg>

      {/* Hover tooltip */}
      {hovered && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded bg-gray-900 border border-bio-border text-xs shadow-lg pointer-events-none z-10">
          <span
            className="inline-block w-2.5 h-2.5 rounded-full mr-2"
            style={{ backgroundColor: getFeatureColor(hovered) }}
          />
          <span className="font-medium text-gray-100">
            {getFeatureLabel(hovered)}
          </span>
          <span className="text-gray-500 ml-2">
            {hovered.type} · {hovered.location.start + 1}–{hovered.location.end}
          </span>
        </div>
      )}
    </div>
  );
};

export default CircularView;
