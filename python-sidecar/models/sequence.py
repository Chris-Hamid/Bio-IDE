"""
Core internal sequence data model for Bio-IDE.

All external formats (GenBank, FASTA, GFF3, SBOL...) are converted
into this clean, typed representation.
"""

from __future__ import annotations

from enum import Enum
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, field_validator
import hashlib


class MoleculeType(str, Enum):
    DNA = "DNA"
    RNA = "RNA"
    PROTEIN = "protein"
    UNKNOWN = "unknown"


class Strand(str, Enum):
    FORWARD = "+"
    REVERSE = "-"
    BOTH = "both"
    UNKNOWN = "."


class FeatureLocation(BaseModel):
    """0-based, half-open coordinates [start, end)"""
    start: int = Field(..., ge=0)
    end: int = Field(..., ge=0)
    strand: Strand = Strand.FORWARD

    @field_validator("end")
    @classmethod
    def end_after_start(cls, v: int, info) -> int:
        start = info.data.get("start", 0)
        if v < start:
            raise ValueError(f"end ({v}) must be >= start ({start})")
        return v

    @property
    def length(self) -> int:
        return self.end - self.start


class Feature(BaseModel):
    """A biological feature / annotation on a sequence."""
    id: str
    type: str  # gene, CDS, promoter, terminator, restriction_site, etc.
    location: FeatureLocation
    qualifiers: Dict[str, Any] = Field(default_factory=dict)
    color: Optional[str] = None  # optional UI hint

    def overlaps(self, other: "Feature") -> bool:
        return not (
            self.location.end <= other.location.start
            or other.location.end <= self.location.start
        )


class SequenceRecord(BaseModel):
    """
    The central data structure of Bio-IDE.

    Designed to be:
    - Easy to serialize (JSON / YAML)
    - Fast to query
    - Independent of any particular file format
    """
    id: str
    name: str = ""
    description: str = ""
    sequence: str
    molecule_type: MoleculeType = MoleculeType.DNA
    circular: bool = False
    features: List[Feature] = Field(default_factory=list)
    annotations: Dict[str, Any] = Field(default_factory=dict)  # free-form metadata

    # Computed / cached
    _length: Optional[int] = None
    _checksum: Optional[str] = None

    @field_validator("sequence")
    @classmethod
    def clean_sequence(cls, v: str) -> str:
        # Remove whitespace and make uppercase
        cleaned = "".join(v.split()).upper()
        return cleaned

    @property
    def length(self) -> int:
        return len(self.sequence)

    @property
    def checksum(self) -> str:
        """SHA-256 of the sequence string (useful for change detection)."""
        return hashlib.sha256(self.sequence.encode()).hexdigest()

    def get_features_in_range(self, start: int, end: int) -> List[Feature]:
        """Return features that overlap the given interval."""
        return [
            f for f in self.features
            if not (f.location.end <= start or f.location.start >= end)
        ]

    def subsequence(self, start: int, end: int) -> str:
        """Return sequence slice [start:end). Handles circular if needed later."""
        if start < 0 or end > self.length or start > end:
            raise ValueError(f"Invalid range [{start}:{end}] for length {self.length}")
        return self.sequence[start:end]

    def add_feature(self, feature: Feature) -> None:
        self.features.append(feature)

    def remove_feature(self, feature_id: str) -> bool:
        original_len = len(self.features)
        self.features = [f for f in self.features if f.id != feature_id]
        return len(self.features) < original_len


class Project(BaseModel):
    """A Bio-IDE project can contain multiple sequence records."""
    name: str
    records: List[SequenceRecord] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)
