"""
FASTA parser → Bio-IDE SequenceRecord
"""

from __future__ import annotations

from typing import List
from Bio import SeqIO
from models.sequence import SequenceRecord, MoleculeType
from io import StringIO
import uuid


def _guess_molecule_type(sequence: str) -> MoleculeType:
    s = sequence.upper()
    if set(s) <= set("ATGCNatgcn"):
        return MoleculeType.DNA
    if set(s) <= set("AUGCNaugcn"):
        return MoleculeType.RNA
    return MoleculeType.UNKNOWN


def parse_fasta(path: str) -> List[SequenceRecord]:
    records: List[SequenceRecord] = []
    for bio_rec in SeqIO.parse(path, "fasta"):
        seq = str(bio_rec.seq)
        record = SequenceRecord(
            id=bio_rec.id or f"seq_{uuid.uuid4().hex[:8]}",
            name=bio_rec.name or bio_rec.id or "",
            description=bio_rec.description or "",
            sequence=seq,
            molecule_type=_guess_molecule_type(seq),
            circular=False,
            features=[],
            annotations={},
        )
        records.append(record)
    return records


def parse_fasta_string(content: str) -> List[SequenceRecord]:
    records: List[SequenceRecord] = []
    for bio_rec in SeqIO.parse(StringIO(content), "fasta"):
        seq = str(bio_rec.seq)
        record = SequenceRecord(
            id=bio_rec.id or f"seq_{uuid.uuid4().hex[:8]}",
            name=bio_rec.name or bio_rec.id or "",
            description=bio_rec.description or "",
            sequence=seq,
            molecule_type=_guess_molecule_type(seq),
            circular=False,
            features=[],
            annotations={},
        )
        records.append(record)
    return records
