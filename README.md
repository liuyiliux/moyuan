# Moyuan

Moyuan is a local multimodal personal knowledge-base application. It manages text, files, images, PDFs, Word/Excel documents, audio, video, and web pages in one workspace, then supports semantic search, RAG Q&A, notes, quizzes, analytics, backup, and provider configuration.

## Current Capabilities

- Multimodal ingestion: text notes, file uploads, folder imports, web URL capture, images, PDFs, DOCX, XLSX, audio, and video.
- Content processing: semantic chunking, embeddings, OCR text extraction, audio/video transcription, web text extraction, and optional web/video screenshots.
- Workspace management: multiple brains, categories, tags, collections, favorites, recycle bin, and per-brain configuration.
- Search and AI: hybrid search, image search endpoint, RAG Q&A with source context, summaries, quiz generation, wrong-answer review, and prompt templates.
- Reading and preview: content detail view, PDF/image/audio/video viewers, extracted text editing, chunk list, annotations, and document structure metadata.
- Data operations: storage settings, analytics dashboard, logs, manual backup, export, restore, and maintenance actions.
- Provider management: OpenAI-compatible providers, encrypted API keys, connection testing, and function bindings for summarize, embedding, chunking, quiz, judge, OCR, transcription, and QA.

## Tech Stack

- Backend: Python 3.10+, FastAPI, SQLAlchemy async, asyncpg, Alembic, pgvector, OpenAI-compatible API clients.
- Frontend: React, TypeScript, Vite, Tailwind CSS, lucide-react, React Router.
- Database: PostgreSQL 16 with pgvector.
- Optional services/tools: Redis, ffmpeg, Playwright browsers, OCR/transcription-capable model providers.

## Quick Start

### 1. Start PostgreSQL

```bash
docker compose up -d postgres
```

Redis is optional:

```bash
docker compose --profile with-redis up -d
```

### 2. Configure the Backend

Create `backend/.env` from your local template if needed, then set database, storage, encryption, and provider values.

Typical development defaults use:

- Backend API: `http://localhost:8005`
- Frontend app: `http://localhost:5173`
- PostgreSQL: `postgresql+asyncpg://moyuan:moyuan@localhost:5432/moyuan`

### 3. Install Backend Dependencies

```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

### 4. Initialize the Database

```bash
cd backend
alembic upgrade head
```

The app also creates missing tables on startup for local development.

### 5. Install Frontend Dependencies

```bash
cd frontend
npm install
```

### 6. Run the App

Backend:

```bash
cd backend
venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8005
```

Frontend:

```bash
cd frontend
npm run dev -- --port 5173
```

Open `http://localhost:5173`.

### One-Command Local Startup

On Windows PowerShell:

```powershell
.\start.ps1
```

Custom ports:

```powershell
.\start.ps1 -Frontend 3000 -Backend 8080
```

## Main Pages

| Page | Route | Purpose |
| --- | --- | --- |
| Contents | `/contents` | Upload, import, browse, process, and manage knowledge-base content. |
| Search | `/search` | Semantic search and RAG Q&A. |
| Notes | `/notes` | Markdown notes, version history, and saved excerpts. |
| Quiz | `/quiz` | Generate questions, answer quizzes, and review wrong answers. |
| Tags | `/tags` | Manage tags. |
| Categories | `/categories` | Manage category trees. |
| Favorites | `/favorites` | Browse favorited content. |
| Collections | `/collections` | Manage collections and collection items. |
| Brains | `/brains` | Manage workspaces and per-brain AI settings. |
| Analytics | `/analytics` | View content, tag, search, and growth statistics. |
| Logs | `/logs` | Inspect runtime logs. |
| Backup | `/backup` | Create, export, delete, and restore backups. |
| Settings | `/settings` | Configure providers, function bindings, storage, and embedding maintenance. |
| Recycle Bin | `/recycle` | Restore or permanently delete removed content. |

## Project Layout

```text
moyuan/
  backend/
    app/
      api/          FastAPI routers
      core/         config, database, crypto, logging
      models/       SQLAlchemy models
      schemas/      Pydantic schemas
      services/     processing, providers, search, storage, queue
    alembic/        database migrations
    tests/          backend tests
  frontend/
    src/
      api/          frontend API clients
      components/   shared UI components
      lib/          theme, copy, brain context
      pages/        route pages
  openspec/         capability specs and archived change records
  data/             local file and backup storage
```

## Validation

Backend tests:

```bash
cd backend
venv\Scripts\python.exe -m pytest tests -q
```

Frontend build:

```bash
cd frontend
npm run build
```

## Notes for Multimodal Features

- OCR and transcription require configured providers with compatible models.
- Web screenshots require Playwright and installed browser binaries.
- Video screenshots require `ffmpeg` to be available on `PATH`.
- If these optional dependencies are missing, Moyuan should still save and process the available text/file data where possible.
