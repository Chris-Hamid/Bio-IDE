/**
 * Protein Translation + Structure Preview panel
 *
 * Shows translations for all frames (or a selected region).
 * Provides links to external structure tools (AlphaFold DB, ESM Atlas).
 */

import React, { useMemo, useState } from "react";
import type { TranslationResult } from "../../types/sequence";
import { clsx } from "clsx";

interface ProteinPanelProps {
  translations: TranslationResult | null;
  selectedSequence?: string | null; // DNA of current selection
  selectedTranslation?: string | null;
  proteinName?: string;
  onClose?: () => void;
}

function cleanProtein(aa: string): string {
  // Remove stop codons for structure tools
  return aa.replace(/\*/g, "").replace(/[^ACDEFGHIKLMNPQRSTVWY]/g, "");
}

export const ProteinPanel: React.FC<ProteinPanelProps> = ({
  translations,
  selectedSequence,
  selectedTranslation,
  proteinName,
  onClose,
}) => {
  const [activeFrame, setActiveFrame] = useState<"+0" | "+1" | "+2">("+0");
  const [copied, setCopied] = useState(false);

  const currentAA = useMemo(() => {
    if (selectedTranslation) return selectedTranslation;
    if (!translations) return "";
    return translations[activeFrame] || "";
  }, [translations, activeFrame, selectedTranslation]);

  const cleanAA = useMemo(() => cleanProtein(currentAA), [currentAA]);

  const copyAA = async () => {
    if (!cleanAA) return;
    await navigator.clipboard.writeText(cleanAA);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // External structure viewers
  const esmFoldUrl = cleanAA
    ? `https://esmatlas.com/resources?query=${encodeURIComponent(cleanAA.slice(0, 400))}`
    : null;

  // AlphaFold DB search (works better with gene/protein name)
  const alphaFoldSearchUrl = proteinName
    ? `https://alphafold.ebi.ac.uk/search/text/${encodeURIComponent(proteinName)}`
    : cleanAA
      ? `https://alphafold.ebi.ac.uk/search/text/${encodeURIComponent(cleanAA.slice(0, 30))}`
      : null;

  // RCSB PDB sequence search
  const pdbSearchUrl = cleanAA
    ? `https://www.rcsb.org/search?request=${encodeURIComponent(
        JSON.stringify({
          query: {
            type: "terminal",
            service: "sequence",
            parameters: {
              value: cleanAA.slice(0, 100),
              target: "pdb_protein_sequence",
            },
          },
          return_type: "entry",
        })
      )}`
    : null;

  if (!translations && !selectedTranslation) {
    return (
      <div className="p-4 text-sm text-gray-500">
        Click <strong>Translate</strong> to generate protein sequences, or select a CDS feature.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full text-sm">
      <div className="px-4 py-3 border-b border-bio-border flex items-center justify-between">
        <span className="font-medium">Protein / Structure</span>
        {onClose && (
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xs">
            Close
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Frame selector (only when full translation) */}
        {translations && !selectedTranslation && (
          <div className="flex gap-1">
            {(["+0", "+1", "+2"] as const).map((frame) => (
              <button
                key={frame}
                onClick={() => setActiveFrame(frame)}
                className={clsx(
                  "px-2.5 py-1 rounded text-xs font-mono transition",
                  activeFrame === frame
                    ? "bg-bio-accent/30 text-white"
                    : "bg-bio-bg text-gray-400 hover:text-gray-200"
                )}
              >
                Frame {frame}
              </button>
            ))}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <div className="text-gray-500">Length</div>
            <div className="font-mono">{cleanAA.length} aa</div>
          </div>
          <div>
            <div className="text-gray-500">Stops (*)</div>
            <div className="font-mono">
              {(currentAA.match(/\*/g) || []).length}
            </div>
          </div>
        </div>

        {/* Amino acid sequence */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-500">Amino acid sequence</span>
            <button
              onClick={copyAA}
              className="text-xs text-bio-accent hover:underline"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <div className="font-mono text-xs break-all bg-bio-bg rounded p-2 max-h-40 overflow-y-auto text-amber-200/90 leading-relaxed">
            {currentAA || "—"}
          </div>
        </div>

        {/* Structure tools */}
        <div className="pt-2 border-t border-bio-border space-y-2">
          <div className="text-xs text-gray-500 mb-2">Structure prediction / lookup</div>

          <a
            href={esmFoldUrl || "#"}
            target="_blank"
            rel="noopener noreferrer"
            className={clsx(
              "block px-3 py-2 rounded border text-xs transition",
              esmFoldUrl
                ? "border-emerald-700/50 bg-emerald-900/20 hover:bg-emerald-900/40 text-emerald-300"
                : "border-bio-border text-gray-600 pointer-events-none"
            )}
          >
            Open in ESM Atlas / ESMFold
            <div className="text-[10px] text-gray-500 mt-0.5">
              Fast structure prediction from sequence
            </div>
          </a>

          <a
            href={alphaFoldSearchUrl || "#"}
            target="_blank"
            rel="noopener noreferrer"
            className={clsx(
              "block px-3 py-2 rounded border text-xs transition",
              alphaFoldSearchUrl
                ? "border-blue-700/50 bg-blue-900/20 hover:bg-blue-900/40 text-blue-300"
                : "border-bio-border text-gray-600 pointer-events-none"
            )}
          >
            Search AlphaFold DB
            <div className="text-[10px] text-gray-500 mt-0.5">
              High-accuracy predicted structures
            </div>
          </a>

          <a
            href={pdbSearchUrl || "#"}
            target="_blank"
            rel="noopener noreferrer"
            className={clsx(
              "block px-3 py-2 rounded border text-xs transition",
              pdbSearchUrl
                ? "border-violet-700/50 bg-violet-900/20 hover:bg-violet-900/40 text-violet-300"
                : "border-bio-border text-gray-600 pointer-events-none"
            )}
          >
            Search RCSB PDB
            <div className="text-[10px] text-gray-500 mt-0.5">
              Experimental structures by sequence
            </div>
          </a>
        </div>

        <p className="text-[10px] text-gray-600 leading-relaxed">
          Structure prediction runs on external servers. For local ESMFold/AlphaFold
          integration later we can add a containerized backend.
        </p>
      </div>
    </div>
  );
};

export default ProteinPanel;
