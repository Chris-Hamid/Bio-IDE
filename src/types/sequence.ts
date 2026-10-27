/**
 * TypeScript mirrors of the Python SequenceRecord model.
 * Keep these in sync with python-sidecar/models/sequence.py
 */

export type MoleculeType = "DNA" | "RNA" | "protein" | "unknown";
export type Strand = "+" | "-" | "both" | ".";

export interface FeatureLocation {
  start: number; // 0-based, inclusive
  end: number;   // 0-based, exclusive
  strand: Strand;
}

export interface Feature {
  id: string;
  type: string;
  location: FeatureLocation;
  qualifiers: Record<string, unknown>;
  color?: string | null;
}

export interface SequenceRecord {
  id: string;
  name: string;
  description: string;
  sequence: string;
  molecule_type: MoleculeType;
  circular: boolean;
  features: Feature[];
  annotations: Record<string, unknown>;
}

export interface SequenceStats {
  length: number;
  counts: Record<string, number>;
  gc_percent: number;
  at_percent: number;
  n_percent: number;
  circular: boolean;
  molecule_type: string;
  feature_count: number;
}

export interface TranslationResult {
  "+0": string;
  "+1": string;
  "+2": string;
}
