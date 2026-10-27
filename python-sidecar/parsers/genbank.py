"""
GenBank parser → Bio-IDE SequenceRecord

Sanitizes Biopython objects (Reference, etc.) so everything is JSON-serializable.
"""

from __future__ import annotations

from typing import List, Any, Dict
from Bio import SeqIO
from Bio.SeqFeature import FeatureLocation as BioFeatureLocation
from models.sequence import (
    SequenceRecord,
    Feature,
    FeatureLocation,
    MoleculeType,
    Strand,
)
import uuid


def _bio_strand_to_ours(strand) -> Strand:
    if strand == 1:
        return Strand.FORWARD
    if strand == -1:
        return Strand.REVERSE
    return Strand.UNKNOWN


def _molecule_type_from_annotations(annotations: dict) -> MoleculeType:
    mol = str(annotations.get("molecule_type", "")).upper()
    if "DNA" in mol:
        return MoleculeType.DNA
    if "RNA" in mol:
        return MoleculeType.RNA
    return MoleculeType.UNKNOWN


def _to_json_safe(obj: Any) -> Any:
    """Recursively convert Biopython / complex objects into JSON-safe values."""
    if obj is None or isinstance(obj, (bool, int, float, str)):
        return obj

    if isinstance(obj, (list, tuple)):
        return [_to_json_safe(x) for x in obj]

    if isinstance(obj, dict):
        return {str(k): _to_json_safe(v) for k, v in obj.items()}

    # Biopython Reference and similar objects
    if hasattr(obj, "__dict__"):
        try:
            # Common Biopython Reference attributes
            data = {}
            for attr in (
                "title",
                "authors",
                "journal",
                "medline_id",
                "pubmed_id",
                "comment",
                "consortium",
                "location",
            ):
                if hasattr(obj, attr):
                    val = getattr(obj, attr)
                    if val is not None and val != "":
                        data[attr] = _to_json_safe(val)
            if data:
                return data
        except Exception:
            pass

    # Fallback: string representation
    try:
        return str(obj)
    except Exception:
        return None


def _clean_qualifiers(qualifiers: dict) -> Dict[str, Any]:
    cleaned: Dict[str, Any] = {}
    for k, v in qualifiers.items():
        if isinstance(v, list) and len(v) == 1:
            cleaned[k] = _to_json_safe(v[0])
        else:
            cleaned[k] = _to_json_safe(v)
    return cleaned


def _clean_annotations(annotations: dict) -> Dict[str, Any]:
    """Keep useful simple annotations; drop or stringify complex ones."""
    safe: Dict[str, Any] = {}
    # Keys that are usually simple and useful
    keep_keys = {
        "molecule_type",
        "topology",
        "data_file_division",
        "date",
        "accessions",
        "sequence_version",
        "gi",
        "keywords",
        "source",
        "organism",
        "taxonomy",
        "comment",
    }
    for k, v in annotations.items():
        key = str(k)
        if key in keep_keys or key.startswith("db_"):
            safe[key] = _to_json_safe(v)
        elif key == "references":
            # Convert list of Reference objects to simple dicts
            safe[key] = _to_json_safe(v)
        # skip other heavy/unknown objects
    return safe


def _parse_bio_record(bio_rec) -> SequenceRecord:
    features: List[Feature] = []

    for i, bio_feat in enumerate(bio_rec.features):
        if bio_feat.type == "source":
            continue

        loc = bio_feat.location
        if not isinstance(loc, BioFeatureLocation):
            if hasattr(loc, "parts") and loc.parts:
                loc = loc.parts[0]
            else:
                continue

        start = int(loc.start)
        end = int(loc.end)
        strand = _bio_strand_to_ours(loc.strand)
        qualifiers = _clean_qualifiers(dict(bio_feat.qualifiers))

        feature = Feature(
            id=str(
                qualifiers.get("locus_tag")
                or qualifiers.get("gene")
                or qualifiers.get("label")
                or f"{bio_feat.type}_{i}_{uuid.uuid4().hex[:8]}"
            ),
            type=bio_feat.type,
            location=FeatureLocation(start=start, end=end, strand=strand),
            qualifiers=qualifiers,
        )
        features.append(feature)

    annotations = _clean_annotations(dict(bio_rec.annotations))
    topology = str(annotations.get("topology", "")).lower()

    return SequenceRecord(
        id=bio_rec.id or bio_rec.name or f"record_{uuid.uuid4().hex[:8]}",
        name=bio_rec.name or bio_rec.id or "",
        description=bio_rec.description or "",
        sequence=str(bio_rec.seq),
        molecule_type=_molecule_type_from_annotations(annotations),
        circular=topology == "circular",
        features=features,
        annotations=annotations,
    )


def parse_genbank(path: str) -> List[SequenceRecord]:
    """Parse a GenBank file and return a list of SequenceRecord objects."""
    return [_parse_bio_record(rec) for rec in SeqIO.parse(path, "genbank")]


def parse_genbank_string(content: str) -> List[SequenceRecord]:
    """Parse GenBank content from a string."""
    from io import StringIO

    return [
        _parse_bio_record(rec)
        for rec in SeqIO.parse(StringIO(content), "genbank")
    ]
