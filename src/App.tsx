import React, { useState, useCallback, useEffect } from "react";
import { SequenceEditor } from "./components/SequenceEditor/SequenceEditor";
import { CircularView } from "./components/CircularView/CircularView";
import { FeatureTracks } from "./components/FeatureTracks/FeatureTracks";
import { FeatureEditPanel } from "./components/FeatureEditPanel/FeatureEditPanel";
import { ProteinPanel } from "./components/ProteinPanel/ProteinPanel";
import { sidecar } from "./lib/sidecar";
import type { SequenceRecord, SequenceStats, TranslationResult, Feature } from "./types/sequence";
import { clsx } from "clsx";

type ViewMode = "linear" | "circular";
type SidebarTab = "info" | "features" | "protein";

function App() {
  const [record, setRecord] = useState<SequenceRecord | null>(null);
  const [stats, setStats] = useState<SequenceStats | null>(null);
  const [translations, setTranslations] = useState<TranslationResult | null>(null);
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [viewMode, setViewMode] = useState<ViewMode>("linear");
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);
  const [showTracks, setShowTracks] = useState(true);
  const [selectedFeature, setSelectedFeature] = useState<Feature | null>(null);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("info");

  // NCBI fetch state
  const [accession, setAccession] = useState("");
  const [isFetching, setIsFetching] = useState(false);
  const [showNcbiPanel, setShowNcbiPanel] = useState(false);

  useEffect(() => {
    sidecar.setStatusCallback(setConnected);
  }, []);

  const applyRecord = useCallback(async (rec: SequenceRecord) => {
    setRecord(rec);
    setTranslations(null);
    setSelectedFeature(null);
    try {
      const s = await sidecar.getStats(rec);
      setStats(s);
    } catch {
      setStats(null);
    }
  }, []);

  const updateFeatures = useCallback(
    (features: Feature[]) => {
      if (!record) return;
      const updated = { ...record, features };
      setRecord(updated);
      setSelectedFeature(null);
    },
    [record]
  );

  const handleFeatureSave = useCallback(
    (updated: Feature) => {
      if (!record) return;
      const features = record.features.map((f) =>
        f.id === updated.id ? updated : f
      );
      updateFeatures(features);
      setStatus(`Updated feature: ${updated.qualifiers?.label || updated.type}`);
      setSidebarTab("info");
    },
    [record, updateFeatures]
  );

  const handleFeatureDelete = useCallback(
    (featureId: string) => {
      if (!record) return;
      updateFeatures(record.features.filter((f) => f.id !== featureId));
      setStatus("Feature deleted");
      setSidebarTab("info");
    },
    [record, updateFeatures]
  );

  const handleFeatureCreate = useCallback(
    (partial: Omit<Feature, "id">) => {
      if (!record) return;
      const newFeature: Feature = {
        ...partial,
        id: `feat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      };
      updateFeatures([...record.features, newFeature]);
      setStatus(`Created feature: ${partial.qualifiers?.label || partial.type}`);
      setSelection(null);
      setSidebarTab("info");
    },
    [record, updateFeatures]
  );

  const loadFile = useCallback(
    async (file: File) => {
      setStatus(`Loading ${file.name}...`);
      try {
        const content = await file.text();
        const name = file.name.toLowerCase();
        const format =
          name.endsWith(".gb") || name.endsWith(".gbk") || name.endsWith(".genbank")
            ? "genbank"
            : "fasta";

        const records = await sidecar.parse(content, format);
        if (records.length === 0) {
          setStatus("No records found in file");
          return;
        }

        await applyRecord(records[0]);
        setStatus(
          `Loaded ${records[0].name || records[0].id} (${records[0].sequence.length.toLocaleString()} bp)`
        );
      } catch (err: any) {
        console.error(err);
        setStatus(`Error: ${err.message}`);
      }
    },
    [applyRecord]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) loadFile(file);
    },
    [loadFile]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) loadFile(file);
    },
    [loadFile]
  );

  const fetchFromNcbi = async () => {
    const acc = accession.trim();
    if (!acc) {
      setStatus("Enter an accession number (e.g. NM_000546.6 or U49845)");
      return;
    }
    setIsFetching(true);
    setStatus(`Fetching ${acc} from NCBI...`);
    try {
      const records = await sidecar.fetchFromNcbi(acc);
      if (!records.length) {
        setStatus("No records returned from NCBI");
        return;
      }
      await applyRecord(records[0]);
      setStatus(
        `Loaded from NCBI: ${records[0].name || records[0].id} (${records[0].sequence.length.toLocaleString()} bp)`
      );
      setShowNcbiPanel(false);
      setAccession("");
    } catch (err: any) {
      console.error(err);
      setStatus(`NCBI error: ${err.message}`);
    } finally {
      setIsFetching(false);
    }
  };

  const runReverseComplement = async () => {
    if (!record) return;
    setStatus("Computing reverse complement...");
    try {
      const result = await sidecar.reverseComplement(record);
      await applyRecord(result);
      setStatus("Reverse complement done");
    } catch (err: any) {
      setStatus(`Error: ${err.message}`);
    }
  };

  const runTranslate = async () => {
    if (!record) return;
    setStatus("Translating...");
    try {
      const result = await sidecar.translate(record);
      setTranslations(result);
      setSidebarTab("protein");
      setStatus("Translation complete — see Protein panel");
    } catch (err: any) {
      setStatus(`Error: ${err.message}`);
    }
  };

  const runFindRestrictionSites = async () => {
    if (!record) return;
    setStatus("Finding restriction sites...");
    try {
      const sites = await sidecar.findRestrictionSites(record);
      const existingIds = new Set(record.features.map((f) => f.id));
      const newSites = sites.filter((s: any) => !existingIds.has(s.id));
      const updated = {
        ...record,
        features: [...record.features, ...newSites],
      };
      setRecord(updated);
      setStatus(
        newSites.length > 0
          ? `Added ${newSites.length} restriction sites`
          : "No new restriction sites found"
      );
    } catch (err: any) {
      setStatus(`Error: ${err.message}`);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-bio-bg text-gray-100">
      {/* Top toolbar */}
      <header className="flex items-center gap-2 px-4 py-2 bg-bio-panel border-b border-bio-border shrink-0 flex-wrap">
        <div className="flex items-center gap-2 mr-3">
          <div className="w-7 h-7 rounded bg-gradient-to-br from-green-500 to-blue-600 flex items-center justify-center text-xs font-bold">
            B
          </div>
          <span className="font-semibold tracking-tight">Bio-IDE</span>
          <span className="text-xs text-gray-500">v0.4</span>
        </div>

        <label className="px-3 py-1.5 rounded bg-bio-accent/20 hover:bg-bio-accent/30 text-sm cursor-pointer transition">
          Open File
          <input
            type="file"
            accept=".gb,.gbk,.genbank,.fasta,.fa,.fna,.txt"
            className="hidden"
            onChange={handleFileInput}
          />
        </label>

        <button
          onClick={() => setShowNcbiPanel((v) => !v)}
          className="px-3 py-1.5 rounded bg-emerald-900/40 hover:bg-emerald-800/50 border border-emerald-700/50 text-sm transition"
        >
          Fetch NCBI
        </button>

        <div className="w-px h-6 bg-bio-border mx-1" />

        <button
          onClick={runReverseComplement}
          disabled={!record}
          className="px-3 py-1.5 rounded bg-bio-panel border border-bio-border text-sm hover:bg-bio-border/50 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          Reverse Complement
        </button>

        <button
          onClick={runTranslate}
          disabled={!record}
          className="px-3 py-1.5 rounded bg-bio-panel border border-bio-border text-sm hover:bg-bio-border/50 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          Translate
        </button>

        <button
          onClick={runFindRestrictionSites}
          disabled={!record}
          className="px-3 py-1.5 rounded bg-bio-panel border border-bio-border text-sm hover:bg-bio-border/50 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          Restriction Sites
        </button>

        <div className="w-px h-6 bg-bio-border mx-1" />

        {/* View mode toggle */}
        <div className="flex rounded border border-bio-border overflow-hidden text-sm">
          <button
            onClick={() => setViewMode("linear")}
            className={clsx(
              "px-3 py-1.5 transition",
              viewMode === "linear"
                ? "bg-bio-accent/30 text-white"
                : "bg-bio-panel text-gray-400 hover:text-gray-200"
            )}
          >
            Linear
          </button>
          <button
            onClick={() => setViewMode("circular")}
            disabled={!record}
            className={clsx(
              "px-3 py-1.5 transition disabled:opacity-40",
              viewMode === "circular"
                ? "bg-bio-accent/30 text-white"
                : "bg-bio-panel text-gray-400 hover:text-gray-200"
            )}
          >
            Circular
          </button>
        </div>

        <button
          onClick={() => setShowTracks((v) => !v)}
          disabled={!record || viewMode === "circular"}
          className={clsx(
            "px-3 py-1.5 rounded border text-sm transition disabled:opacity-40",
            showTracks
              ? "bg-bio-accent/20 border-bio-accent/40 text-white"
              : "bg-bio-panel border-bio-border text-gray-400 hover:text-gray-200"
          )}
        >
          Tracks
        </button>

        <div className="ml-auto flex items-center gap-3 text-xs">
          <div
            className={clsx(
              "w-2 h-2 rounded-full",
              connected ? "bg-green-500" : "bg-red-500"
            )}
          />
          <span className="text-gray-400">
            {connected ? "Sidecar connected" : "Sidecar offline"}
          </span>
        </div>
      </header>

      {/* NCBI Fetch panel */}
      {showNcbiPanel && (
        <div className="px-4 py-3 bg-bio-panel/80 border-b border-bio-border flex items-center gap-3 shrink-0">
          <span className="text-sm text-gray-400">Accession:</span>
          <input
            type="text"
            value={accession}
            onChange={(e) => setAccession(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && fetchFromNcbi()}
            placeholder="e.g. NM_000546.6  or  U49845"
            className="px-3 py-1.5 rounded bg-bio-bg border border-bio-border text-sm font-mono w-64 focus:outline-none focus:border-bio-accent"
            disabled={isFetching}
          />
          <button
            onClick={fetchFromNcbi}
            disabled={isFetching || !accession.trim()}
            className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            {isFetching ? "Fetching…" : "Fetch"}
          </button>
          <span className="text-xs text-gray-500">
            Uses NCBI E-utilities · GenBank format preferred
          </span>
          <button
            onClick={() => setShowNcbiPanel(false)}
            className="ml-auto text-gray-500 hover:text-gray-300 text-sm"
          >
            Close
          </button>
        </div>
      )}

      {/* Main content */}
      <div
        className="flex-1 flex overflow-hidden"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        {/* Editor / Circular view + Feature tracks */}
        <div className="flex-1 flex flex-col min-w-0">
          {viewMode === "circular" && record ? (
            <CircularView record={record} className="flex-1" />
          ) : (
            <>
              <SequenceEditor
                record={record}
                className="flex-1 min-h-0"
                onSelectionChange={(start, end) => {
                  if (end > start) setSelection({ start, end });
                  else setSelection(null);
                }}
              />
              {record && showTracks && (
                <FeatureTracks
                  record={record}
                  selection={selection}
                  onFeatureClick={(f: Feature) => {
                    setSelection({
                      start: f.location.start,
                      end: f.location.end,
                    });
                    setSelectedFeature(f);
                    setSidebarTab("features");
                    setStatus(
                      `Selected: ${f.qualifiers?.label || f.type} ${f.location.start + 1}–${f.location.end}`
                    );
                  }}
                  onRangeSelect={(start, end) => {
                    setSelection({ start, end });
                    setSelectedFeature(null);
                  }}
                  className="h-48 max-h-[40%] shrink-0"
                />
              )}
            </>
          )}
        </div>

        {/* Right sidebar */}
        <aside className="w-80 border-l border-bio-border bg-bio-panel flex flex-col overflow-hidden shrink-0">
          {/* Tab bar */}
          <div className="flex border-b border-bio-border text-xs shrink-0">
            {(
              [
                ["info", "Info"],
                ["features", "Features"],
                ["protein", "Protein"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setSidebarTab(id)}
                className={clsx(
                  "flex-1 px-2 py-2.5 transition",
                  sidebarTab === id
                    ? "bg-bio-bg text-white border-b-2 border-bio-accent"
                    : "text-gray-500 hover:text-gray-300"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-hidden flex flex-col">
            {sidebarTab === "info" && (
              <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
                {stats ? (
                  <>
                    <div>
                      <div className="text-gray-500 text-xs mb-1">Length</div>
                      <div className="font-mono">
                        {stats.length.toLocaleString()} bp
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-500 text-xs mb-1">GC Content</div>
                      <div className="font-mono">{stats.gc_percent}%</div>
                    </div>
                    <div>
                      <div className="text-gray-500 text-xs mb-1">Features</div>
                      <div className="font-mono">
                        {record?.features.length ?? stats.feature_count}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-500 text-xs mb-1">Composition</div>
                      <div className="grid grid-cols-2 gap-1 font-mono text-xs mt-1">
                        {Object.entries(stats.counts).map(([base, count]) => (
                          <div key={base} className="flex justify-between">
                            <span className="text-gray-400">{base}</span>
                            <span>{count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    {selection && selection.end > selection.start && (
                      <div className="pt-3 border-t border-bio-border">
                        <div className="text-gray-500 text-xs mb-1">Selection</div>
                        <div className="font-mono text-blue-300">
                          {selection.start + 1}–{selection.end} (
                          {selection.end - selection.start} bp)
                        </div>
                        <button
                          onClick={() => {
                            setSelectedFeature(null);
                            setSidebarTab("features");
                          }}
                          className="mt-2 text-xs text-bio-accent hover:underline"
                        >
                          Create feature from selection
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-gray-500 text-sm">
                    Load a sequence or fetch from NCBI
                  </div>
                )}
              </div>
            )}

            {sidebarTab === "features" && (
              <FeatureEditPanel
                feature={selectedFeature}
                record={record}
                selection={selection}
                onSave={handleFeatureSave}
                onDelete={handleFeatureDelete}
                onCreateFromSelection={handleFeatureCreate}
                onClose={() => {
                  setSelectedFeature(null);
                  setSidebarTab("info");
                }}
              />
            )}

            {sidebarTab === "protein" && (
              <ProteinPanel
                translations={translations}
                proteinName={record?.name}
                onClose={() => setSidebarTab("info")}
              />
            )}
          </div>
        </aside>
      </div>

      {/* Status bar */}
      <footer className="px-4 py-1.5 bg-bio-panel border-t border-bio-border text-xs text-gray-500 shrink-0">
        {status || "Ready"}
      </footer>
    </div>
  );
}

export default App;
