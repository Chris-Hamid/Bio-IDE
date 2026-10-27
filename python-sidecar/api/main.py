"""
Bio-IDE Python Sidecar – FastAPI + WebSocket server

Exposes sequence parsing and operations to the frontend.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from models.sequence import SequenceRecord
from parsers.genbank import parse_genbank_string
from parsers.fasta import parse_fasta_string
from operations.sequence_ops import (
    reverse_complement,
    translate_all_frames,
    find_restriction_sites,
    add_restriction_sites_as_features,
    get_sequence_stats,
)
from operations.ncbi_fetch import fetch_from_ncbi

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("bio-ide.sidecar")

app = FastAPI(
    title="Bio-IDE Sidecar",
    description="Compute engine for the Bio-IDE",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ------------------------------------------------------------------
# Request / Response models
# ------------------------------------------------------------------

class ParseRequest(BaseModel):
    content: str
    format: str  # "genbank" | "fasta"


class TranslateRequest(BaseModel):
    sequence: str
    frames: List[int] = [0, 1, 2]


class RestrictionRequest(BaseModel):
    sequence: str
    enzymes: Optional[List[str]] = None


class NcbiFetchRequest(BaseModel):
    accession: str
    email: Optional[str] = None
    rettype: str = "gb"


class OperationRequest(BaseModel):
    record: Dict[str, Any]  # SequenceRecord as dict
    operation: str
    params: Dict[str, Any] = {}


# ------------------------------------------------------------------
# REST endpoints (useful for testing & simple calls)
# ------------------------------------------------------------------

@app.get("/health")
def health():
    return {"status": "ok", "service": "bio-ide-sidecar"}


@app.post("/parse")
def parse_sequence(req: ParseRequest):
    try:
        if req.format.lower() in ("genbank", "gb", "gbk"):
            records = parse_genbank_string(req.content)
        elif req.format.lower() in ("fasta", "fa", "fna"):
            records = parse_fasta_string(req.content)
        else:
            raise HTTPException(400, f"Unsupported format: {req.format}")
        return [r.model_dump() for r in records]
    except Exception as e:
        logger.exception("Parse failed")
        raise HTTPException(400, str(e))


@app.post("/stats")
def stats(record_dict: Dict[str, Any]):
    try:
        record = SequenceRecord.model_validate(record_dict)
        return get_sequence_stats(record)
    except Exception as e:
        raise HTTPException(400, str(e))


@app.post("/reverse-complement")
def rc(record_dict: Dict[str, Any]):
    try:
        record = SequenceRecord.model_validate(record_dict)
        result = reverse_complement(record)
        return result.model_dump()
    except Exception as e:
        raise HTTPException(400, str(e))


@app.post("/translate")
def do_translate(record_dict: Dict[str, Any]):
    try:
        record = SequenceRecord.model_validate(record_dict)
        return translate_all_frames(record)
    except Exception as e:
        raise HTTPException(400, str(e))


@app.post("/restriction-sites")
def restriction_sites(req: RestrictionRequest):
    try:
        # Minimal record just for searching
        record = SequenceRecord(
            id="temp",
            sequence=req.sequence,
        )
        sites = find_restriction_sites(record, req.enzymes)
        return [s.model_dump() for s in sites]
    except Exception as e:
        raise HTTPException(400, str(e))


@app.post("/ncbi/fetch")
def ncbi_fetch(req: NcbiFetchRequest):
    try:
        records = fetch_from_ncbi(
            accession=req.accession,
            email=req.email,
            rettype=req.rettype,
        )
        return [r.model_dump() for r in records]
    except Exception as e:
        logger.exception("NCBI fetch failed")
        raise HTTPException(400, str(e))


# ------------------------------------------------------------------
# WebSocket endpoint – primary communication channel for the IDE
# ------------------------------------------------------------------

class ConnectionManager:
    def __init__(self):
        self.active: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active.append(websocket)
        logger.info("Client connected")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active:
            self.active.remove(websocket)
        logger.info("Client disconnected")

    async def send_json(self, websocket: WebSocket, data: dict):
        await websocket.send_json(data)


manager = ConnectionManager()


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                message = json.loads(raw)
            except json.JSONDecodeError:
                await manager.send_json(websocket, {
                    "type": "error",
                    "message": "Invalid JSON"
                })
                continue

            msg_type = message.get("type")
            payload = message.get("payload", {})
            request_id = message.get("id")

            try:
                if msg_type == "ping":
                    response = {"type": "pong"}

                elif msg_type == "parse":
                    fmt = payload.get("format", "genbank")
                    content = payload.get("content", "")
                    if fmt in ("genbank", "gb", "gbk"):
                        records = parse_genbank_string(content)
                    else:
                        records = parse_fasta_string(content)
                    response = {
                        "type": "parse_result",
                        "records": [r.model_dump() for r in records],
                    }

                elif msg_type == "reverse_complement":
                    record = SequenceRecord.model_validate(payload["record"])
                    result = reverse_complement(record)
                    response = {
                        "type": "operation_result",
                        "operation": "reverse_complement",
                        "record": result.model_dump(),
                    }

                elif msg_type == "translate":
                    record = SequenceRecord.model_validate(payload["record"])
                    result = translate_all_frames(record)
                    response = {
                        "type": "operation_result",
                        "operation": "translate",
                        "translations": result,
                    }

                elif msg_type == "find_restriction_sites":
                    record = SequenceRecord.model_validate(payload["record"])
                    enzymes = payload.get("enzymes")
                    sites = find_restriction_sites(record, enzymes)
                    response = {
                        "type": "operation_result",
                        "operation": "find_restriction_sites",
                        "sites": [s.model_dump() for s in sites],
                    }

                elif msg_type == "stats":
                    record = SequenceRecord.model_validate(payload["record"])
                    response = {
                        "type": "operation_result",
                        "operation": "stats",
                        "stats": get_sequence_stats(record),
                    }

                elif msg_type == "ncbi_fetch":
                    accession = payload.get("accession", "").strip()
                    email = payload.get("email")
                    rettype = payload.get("rettype", "gb")
                    records = fetch_from_ncbi(
                        accession=accession,
                        email=email,
                        rettype=rettype,
                    )
                    response = {
                        "type": "ncbi_fetch_result",
                        "records": [r.model_dump() for r in records],
                    }

                else:
                    response = {
                        "type": "error",
                        "message": f"Unknown message type: {msg_type}",
                    }

                if request_id is not None:
                    response["id"] = request_id

                await manager.send_json(websocket, response)

            except Exception as e:
                logger.exception("Error handling message")
                await manager.send_json(websocket, {
                    "type": "error",
                    "id": request_id,
                    "message": str(e),
                })

    except WebSocketDisconnect:
        manager.disconnect(websocket)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "api.main:app",
        host="127.0.0.1",
        port=8741,
        reload=True,
        log_level="info",
    )
