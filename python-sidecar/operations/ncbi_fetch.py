"""
Fetch sequence records from NCBI using Entrez E-utilities.
"""

from __future__ import annotations

import logging
from typing import List, Optional
from Bio import Entrez
from parsers.genbank import parse_genbank_string
from parsers.fasta import parse_fasta_string
from models.sequence import SequenceRecord

logger = logging.getLogger("bio-ide.ncbi")

# NCBI requires an email address for E-utilities.
# Users should set their own; this is a fallback for development.
DEFAULT_EMAIL = "bioide-dev@example.com"


def fetch_from_ncbi(
    accession: str,
    email: Optional[str] = None,
    rettype: str = "gb",
) -> List[SequenceRecord]:
    """
    Fetch one or more records from NCBI by accession (or comma-separated list).

    Parameters
    ----------
    accession : str
        Accession number(s), e.g. "NM_000546.6" or "U49845,AY123456"
    email : str, optional
        Email for NCBI. Strongly recommended to use your own.
    rettype : str
        "gb" for GenBank (preferred) or "fasta"
    """
    accession = accession.strip()
    if not accession:
        raise ValueError("Accession number is required")

    Entrez.email = email or DEFAULT_EMAIL
    # Optional: Entrez.api_key = "YOUR_KEY"  # raises rate limit from 3 → 10 req/s

    logger.info(f"Fetching NCBI record(s): {accession} (rettype={rettype})")

    try:
        handle = Entrez.efetch(
            db="nuccore",
            id=accession,
            rettype=rettype,
            retmode="text",
        )
        content = handle.read()
        handle.close()
    except Exception as e:
        logger.exception("NCBI fetch failed")
        raise RuntimeError(f"NCBI fetch failed: {e}") from e

    if not content or content.strip().startswith("Error"):
        raise RuntimeError(f"NCBI returned an error or empty response for '{accession}'")

    if rettype in ("gb", "gbk", "genbank"):
        records = parse_genbank_string(content)
    else:
        records = parse_fasta_string(content)

    if not records:
        raise RuntimeError(f"No sequences could be parsed from NCBI response for '{accession}'")

    logger.info(f"Successfully fetched {len(records)} record(s)")
    return records
