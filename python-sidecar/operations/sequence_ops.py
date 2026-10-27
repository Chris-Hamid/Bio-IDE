"""
Core sequence operations used by the Bio-IDE.

All heavy lifting lives here so the frontend stays thin.
"""

from __future__ import annotations

from typing import List, Dict, Any, Optional
from Bio.Seq import Seq
from Bio.Data import CodonTable
from models.sequence import SequenceRecord, Feature, FeatureLocation, Strand
import uuid


# Common restriction enzymes (recognition site → cut info)
# For MVP we store the recognition sequence. Later we can expand to full REBASE data.
COMMON_RESTRICTION_ENZYMES: Dict[str, str] = {
    "EcoRI": "GAATTC",
    "BamHI": "GGATCC",
    "HindIII": "AAGCTT",
    "XhoI": "CTCGAG",
    "NotI": "GCGGCCGC",
    "NdeI": "CATATG",
    "XbaI": "TCTAGA",
    "SpeI": "ACTAGT",
    "PstI": "CTGCAG",
    "SacI": "GAGCTC",
    "KpnI": "GGTACC",
    "SmaI": "CCCGGG",
    "EcoRV": "GATATC",
    "NcoI": "CCATGG",
    "BglII": "AGATCT",
    "SalI": "GTCGAC",
    "ApaI": "GGGCCC",
    "ClaI": "ATCGAT",
}


def reverse_complement(record: SequenceRecord) -> SequenceRecord:
    """Return a new SequenceRecord with reverse-complemented sequence.
    Features are adjusted accordingly (simplified for MVP).
    """
    seq = Seq(record.sequence)
    rc_seq = str(seq.reverse_complement())

    # For MVP we drop features on reverse-complement (proper coordinate transform is more complex)
    # TODO: properly transform feature coordinates and strands
    new_record = record.model_copy(deep=True)
    new_record.sequence = rc_seq
    new_record.id = f"{record.id}_rc"
    new_record.name = f"{record.name} (reverse complement)"
    new_record.features = []  # reset for now
    return new_record


def translate(
    record: SequenceRecord,
    frame: int = 0,
    table: int = 1,
    to_stop: bool = False,
) -> str:
    """
    Translate the sequence in the given frame (0, 1, or 2).
    Returns the amino-acid string.
    """
    if frame not in (0, 1, 2):
        raise ValueError("frame must be 0, 1, or 2")

    seq = Seq(record.sequence[frame:])
    protein = seq.translate(table=table, to_stop=to_stop)
    return str(protein)


def translate_all_frames(record: SequenceRecord, table: int = 1) -> Dict[str, str]:
    """Return translations for frames +0, +1, +2."""
    return {
        f"+{frame}": translate(record, frame=frame, table=table)
        for frame in (0, 1, 2)
    }


def find_restriction_sites(
    record: SequenceRecord,
    enzymes: Optional[List[str]] = None,
) -> List[Feature]:
    """
    Find restriction sites and return them as Feature objects.
    """
    if enzymes is None:
        enzymes = list(COMMON_RESTRICTION_ENZYMES.keys())

    seq = record.sequence.upper()
    found: List[Feature] = []

    for enzyme in enzymes:
        site = COMMON_RESTRICTION_ENZYMES.get(enzyme)
        if not site:
            continue

        site = site.upper()
        start = 0
        while True:
            idx = seq.find(site, start)
            if idx == -1:
                break

            feature = Feature(
                id=f"{enzyme}_{idx}_{uuid.uuid4().hex[:6]}",
                type="restriction_site",
                location=FeatureLocation(
                    start=idx,
                    end=idx + len(site),
                    strand=Strand.FORWARD,
                ),
                qualifiers={
                    "enzyme": enzyme,
                    "recognition_sequence": site,
                    "label": enzyme,
                },
                color="#e74c3c",  # red-ish for restriction sites
            )
            found.append(feature)
            start = idx + 1  # allow overlapping sites

    return found


def add_restriction_sites_as_features(
    record: SequenceRecord,
    enzymes: Optional[List[str]] = None,
) -> SequenceRecord:
    """Return a new record with restriction sites added as features."""
    sites = find_restriction_sites(record, enzymes)
    new_record = record.model_copy(deep=True)
    new_record.features.extend(sites)
    return new_record


def get_sequence_stats(record: SequenceRecord) -> Dict[str, Any]:
    """Basic composition statistics."""
    seq = record.sequence.upper()
    length = len(seq)
    if length == 0:
        return {"length": 0}

    counts = {base: seq.count(base) for base in "ATGCN"}
    gc = counts.get("G", 0) + counts.get("C", 0)
    at = counts.get("A", 0) + counts.get("T", 0)

    return {
        "length": length,
        "counts": counts,
        "gc_percent": round(100 * gc / length, 2) if length else 0,
        "at_percent": round(100 * at / length, 2) if length else 0,
        "n_percent": round(100 * counts.get("N", 0) / length, 2) if length else 0,
        "circular": record.circular,
        "molecule_type": record.molecule_type.value,
        "feature_count": len(record.features),
    }
