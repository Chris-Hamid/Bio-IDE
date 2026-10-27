/**
 * Semantic Feature Editor
 *
 * Edit selected feature properties: label, type, notes, color.
 * Supports delete and basic create-from-selection.
 */

import React, { useState, useEffect } from "react";
import type { Feature, SequenceRecord } from "../../types/sequence";
import { clsx } from "clsx";

const FEATURE_TYPES = [
  "gene",
  "CDS",
  "mRNA",
  "promoter",
  "terminator",
  "restriction_site",
  "misc_feature",
  "regulatory",
  "exon",
  "intron",
  "tRNA",
  "rRNA",
  "source",
];

const PRESET_COLORS = [
  "#22c55e",
  "#3b82f6",
  "#a855f7",
  "#f97316",
  "#ef4444",
  "#06b6d4",
  "#94a3b8",
  "#eab308",
];

interface FeatureEditPanelProps {
  feature: Feature | null;
  record: SequenceRecord | null;
  selection?: { start: number; end: number } | null;
  onSave: (updated: Feature) => void;
  onDelete: (featureId: string) => void;
  onCreateFromSelection: (partial: Omit<Feature, "id">) => void;
  onClose: () => void;
}

export const FeatureEditPanel: React.FC<FeatureEditPanelProps> = ({
  feature,
  record,
  selection,
  onSave,
  onDelete,
  onCreateFromSelection,
  onClose,
}) => {
  const [label, setLabel] = useState("");
  const [type, setType] = useState("misc_feature");
  const [note, setNote] = useState("");
  const [color, setColor] = useState("#94a3b8");
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);

  useEffect(() => {
    if (feature) {
      setLabel(
        (feature.qualifiers?.label as string) ||
          (feature.qualifiers?.gene as string) ||
          (feature.qualifiers?.enzyme as string) ||
          ""
      );
      setType(feature.type || "misc_feature");
      setNote((feature.qualifiers?.note as string) || "");
      setColor(feature.color || "#94a3b8");
      setStart(feature.location.start);
      setEnd(feature.location.end);
    } else if (selection && selection.end > selection.start) {
      setLabel("");
      setType("misc_feature");
      setNote("");
      setColor("#94a3b8");
      setStart(selection.start);
      setEnd(selection.end);
    }
  }, [feature, selection]);

  const isCreateMode = !feature && selection && selection.end > selection.start;

  if (!feature && !isCreateMode) {
    return (
      <div className="p-4 text-sm text-gray-500">
        Select a feature in the tracks or select a sequence range to create one.
      </div>
    );
  }

  const handleSave = () => {
    if (feature) {
      const updated: Feature = {
        ...feature,
        type,
        color,
        location: {
          ...feature.location,
          start: Math.max(0, start),
          end: Math.max(start + 1, end),
        },
        qualifiers: {
          ...feature.qualifiers,
          label: label || undefined,
          note: note || undefined,
        },
      };
      onSave(updated);
    } else if (isCreateMode) {
      onCreateFromSelection({
        type,
        color,
        location: {
          start: Math.max(0, start),
          end: Math.max(start + 1, end),
          strand: "+",
        },
        qualifiers: {
          label: label || undefined,
          note: note || undefined,
        },
      });
    }
  };

  return (
    <div className="flex flex-col h-full text-sm">
      <div className="px-4 py-3 border-b border-bio-border flex items-center justify-between">
        <span className="font-medium">
          {feature ? "Edit Feature" : "New Feature"}
        </span>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-300 text-xs"
        >
          Close
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Label</label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. lacZ, EcoRI, promoter"
            className="w-full px-2 py-1.5 rounded bg-bio-bg border border-bio-border text-sm focus:outline-none focus:border-bio-accent"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full px-2 py-1.5 rounded bg-bio-bg border border-bio-border text-sm focus:outline-none focus:border-bio-accent"
          >
            {FEATURE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Start (0-based)</label>
            <input
              type="number"
              value={start}
              min={0}
              max={record ? record.sequence.length - 1 : undefined}
              onChange={(e) => setStart(parseInt(e.target.value) || 0)}
              className="w-full px-2 py-1.5 rounded bg-bio-bg border border-bio-border text-sm font-mono focus:outline-none focus:border-bio-accent"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">End (exclusive)</label>
            <input
              type="number"
              value={end}
              min={1}
              max={record ? record.sequence.length : undefined}
              onChange={(e) => setEnd(parseInt(e.target.value) || 1)}
              className="w-full px-2 py-1.5 rounded bg-bio-bg border border-bio-border text-sm font-mono focus:outline-none focus:border-bio-accent"
            />
          </div>
        </div>

        <div className="text-xs text-gray-500">
          Length: {Math.max(0, end - start).toLocaleString()} bp
          {record && (
            <span className="ml-2 font-mono text-gray-400">
              {record.sequence.slice(start, Math.min(end, start + 30))}
              {end - start > 30 ? "…" : ""}
            </span>
          )}
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Note</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="w-full px-2 py-1.5 rounded bg-bio-bg border border-bio-border text-sm focus:outline-none focus:border-bio-accent resize-none"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Color</label>
          <div className="flex gap-1.5 flex-wrap">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={clsx(
                  "w-6 h-6 rounded border-2 transition",
                  color === c ? "border-white scale-110" : "border-transparent"
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="px-4 py-3 border-t border-bio-border flex gap-2">
        <button
          onClick={handleSave}
          className="flex-1 px-3 py-1.5 rounded bg-bio-accent/30 hover:bg-bio-accent/40 text-sm font-medium transition"
        >
          {feature ? "Save" : "Create"}
        </button>
        {feature && (
          <button
            onClick={() => onDelete(feature.id)}
            className="px-3 py-1.5 rounded bg-red-900/40 hover:bg-red-800/50 text-sm text-red-300 transition"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
};

export default FeatureEditPanel;
