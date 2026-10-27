# Bio-IDE

**The open-source Biological Integrated Development Environment**  
*"VS Code for DNA & RNA"*

A modern, fast desktop IDE for sequence design, annotation, NCBI fetch, feature editing, and lightweight protein analysis.

![Status](https://img.shields.io/badge/status-MVP-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Stack](https://img.shields.io/badge/stack-React%20%2B%20Python%20%2B%20Tauri-orange)

## Features (v0.4)

- **Virtualized sequence editor** — handles multi-kb sequences without freezing
- **Circular plasmid / genome map** — features as arcs, hover tooltips
- **Feature tracks** — genome-browser style annotation tracks with filtering
- **Semantic feature editing** — create, edit, delete annotations
- **NCBI fetch** — load GenBank records by accession (E-utilities)
- **Restriction sites** — detect common enzymes and annotate
- **Translation** — 3-frame protein translation
- **Structure links** — open sequences in ESM Atlas, AlphaFold DB, RCSB PDB
- **Local file support** — GenBank (`.gb` / `.gbk`) and FASTA

## Quick Start

### Prerequisites

- **Node.js** 20+
- **Python** 3.11+ (3.12/3.13 OK)
- Optional: Rust + Tauri CLI for native desktop builds

### 1. Clone

```bash
git clone https://github.com/Chris-Hamid/Bio-IDE.git
cd bio-ide
```

### 2. Python sidecar

```bash
cd python-sidecar
python -m venv .venv

# Windows (Git Bash)
source .venv/Scripts/activate
# macOS / Linux
# source .venv/bin/activate

pip install --upgrade pip
pip install -r requirements.txt
python -m api.main
```

Sidecar runs at **http://127.0.0.1:8741**

### 3. Frontend (new terminal)

```bash
cd bio-ide
npm install
npm run dev
```

Open **http://localhost:1420**

### 4. Try it

1. Confirm green **Sidecar connected** indicator  
2. **Fetch NCBI** → try `U49845` or tardigrade Dsup `LC050827`  
3. **Restriction Sites** → features appear on tracks  
4. Toggle **Circular** / **Linear** / **Tracks**  
5. Click a feature → edit in the **Features** panel  
6. **Translate** → **Protein** tab → structure tool links  

## Architecture

```
┌─────────────────────────────────────────────────────┐
│              React + TypeScript UI                  │
│  Sequence Editor · Circular Map · Feature Tracks    │
└───────────────────────┬─────────────────────────────┘
                        │  WebSocket
┌───────────────────────▼─────────────────────────────┐
│           Python Sidecar (FastAPI + Biopython)      │
│  Parsers · Sequence model · NCBI · Operations       │
└─────────────────────────────────────────────────────┘
```

| Layer | Tech |
|-------|------|
| Shell | Tauri 2 (optional native packaging) |
| Frontend | React 18, TypeScript, Vite, Tailwind |
| Backend | Python, FastAPI, Biopython, Pydantic |
| Comms | WebSocket (port 8741) |

## Project structure

```
bio-ide/
├── src/                          # React frontend
│   ├── components/
│   │   ├── SequenceEditor/
│   │   ├── CircularView/
│   │   ├── FeatureTracks/
│   │   ├── FeatureEditPanel/
│   │   └── ProteinPanel/
│   ├── lib/sidecar.ts
│   └── types/sequence.ts
├── python-sidecar/
│   ├── api/main.py
│   ├── models/sequence.py
│   ├── parsers/                  # GenBank, FASTA
│   ├── operations/               # RC, translate, RE, NCBI
│   └── requirements.txt
├── src-tauri/                    # Tauri desktop shell
└── public/example.fasta
```

## Roadmap

- [x] Virtualized linear editor + selection/copy
- [x] Circular view
- [x] Feature tracks + semantic editing
- [x] NCBI accession fetch
- [x] Translation + structure tool links
- [ ] Scroll-sync between sequence and tracks
- [ ] Git-based sequence versioning (semantic diffs)
- [ ] Plugin API
- [ ] Local / containerized structure prediction
- [ ] SBOL / GFF3 import-export

## NCBI note

Fetching uses [NCBI E-utilities](https://www.ncbi.nlm.nih.gov/home/develop/api/). For heavy use, set your own email (and optional API key) in the sidecar. See `python-sidecar/operations/ncbi_fetch.py`.

## License

MIT — see [LICENSE](LICENSE).

## Contributing

Issues and PRs welcome. For large changes, open an issue first so we can align on design.
