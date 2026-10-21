# ⚡ App Builder Agent

> An interactive AI-powered web app generator & editor inspired by Lovable. Build complete web apps from natural language, preview them in real time, and iteratively edit code in-place through a persistent chat interface.

🌐 **Live Demo:** [https://app-builder-agent-zd50.onrender.com/](https://app-builder-agent-zd50.onrender.com/)

---

## 🌟 Key Features

- **💬 Lovable-Style In-Place Chat Editing**:
  - Tweak styling, add features, fix bugs, or adjust layouts without regenerating the entire app.
  - Automatically modifies existing files in-place while keeping project history intact.
  - Remembers conversation history per project with instant clear/reset options.
- **⚡ 3-Tier Multi-Agent Pipeline**:
  - 📐 **Planner**: Translates user requirements into a comprehensive architectural plan (`openai/gpt-oss-20b`).
  - 🏗️ **Architect**: Decomposes the plan into ordered, file-level implementation tasks.
  - ✍️ **Coder**: Implements production-ready code file by file with automated validation (`openai/gpt-oss-120b`).
- **🔍 Granular Live Activity Streaming**:
  - Real-time visual progress through every sub-phase:
    - 📐 `planning`: Application architecture & feature definition
    - 🏗️ `architecting`: Task decomposition & dependency ordering
    - 🔍 `searching`: Locating project files in the workspace
    - 📖 `reading`: Inspecting existing code or detecting new files
    - ✍️ `coding`: Generating file contents with live progress count `(x / y)`
    - ✅ `completed_file`: Verification and disk persistence
- **🕒 Automatic Version Snapshots & Rollbacks**:
  - Every initial build and subsequent chat modification automatically saves a point-in-time snapshot.
  - One-click rollback to any prior version from the **History** tab.
- **👁️ Live Interactive Preview**:
  - Embedded, isolated live iframe preview with instant cache-busting refresh.
- **📁 Isolated Git-Clean Workspace**:
  - All user projects and history versions are stored in `storage/projects/<project_name>`, strictly isolated and gitignored.
- **🛡️ Robust Fallback Engine**:
  - Dual-mode execution automatically switches to markdown code extraction whenever Groq encounters tool-call JSON parsing limits.

---

## 🏗️ Architecture

```
app-builder-agent/
├── agent/
│   ├── graph.py        # LangGraph StateGraph pipeline (Planner → Architect → Coder)
│   ├── prompt.py       # LLM prompts for Planning, Architecting, and Coding
│   ├── states.py       # Pydantic schemas for Plan, TaskPlan, and CoderState
│   ├── tools.py        # Project file I/O tools (read_file, write_file, safe paths)
│   └── parser.py       # Markdown code block extractor fallback
├── backend/
│   └── main.py         # FastAPI app, WebSocket generation runner, Chat API, Static Preview
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ChatEditor.jsx      # In-place chat refinement with history & badge pills
│   │   │   ├── PipelineStatus.jsx  # Lovable-style visual step bar with live indicators
│   │   │   ├── PreviewPane.jsx     # Live sandbox iframe with refresh button
│   │   │   ├── ProjectSidebar.jsx  # Minimizable multi-project workspace drawer
│   │   │   ├── HistoryView.jsx     # Version snapshots & rollbacks
│   │   │   ├── FileExplorer.jsx    # Project source code file viewer
│   │   │   ├── LogStream.jsx       # Color-coded live event logs
│   │   │   └── PlanView.jsx        # Architectural specifications breakdown
│   │   ├── hooks/
│   │   │   └── useAgentSocket.js   # WebSocket client for real-time generation phases
│   │   └── App.jsx                 # Main 3-panel workspace layout
│   └── dist/                       # Production frontend build
├── storage/projects/   # Isolated project workspaces & snapshots (gitignored)
├── Dockerfile          # Single-container production build (Node + Python)
└── render.yaml         # Render deployment configuration
```

---

## 🚀 Getting Started

### Prerequisites

- **Python 3.10+**
- **Node.js 18+** & npm
- **Groq API Key** (set in `.env`)

### 1. Environment Setup

Clone the repository and create your `.env` file:

```bash
git clone https://github.com/your-username/app-builder-agent.git
cd app-builder-agent
```

Create a `.env` file in the root directory:

```env
GROQ_API_KEY=your_groq_api_key_here
PORT=8000
```

### 2. Backend Setup

```bash
python -m venv venv
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

pip install -r requirements.txt
```

### 3. Frontend Setup & Build

```bash
cd frontend
npm install
npm run build
cd ..
```

### 4. Run Locally

Start the unified server with Uvicorn:

```bash
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

Open your browser at **`http://localhost:8000`**.

---

## 🐳 Docker Deployment

The application includes a production multi-stage `Dockerfile` that builds the React frontend with Vite and serves everything via FastAPI from a single lightweight container:

```bash
docker build -t app-builder-agent .
docker run -p 8000:8000 -e GROQ_API_KEY="your_key" app-builder-agent
```

---

## 🛠️ Tech Stack

- **Frontend**: React 18, Vite, Lucide/Unicode icons, CSS Glassmorphism
- **Backend**: FastAPI, Uvicorn, WebSockets, Python `asyncio`
- **Agent Orchestration**: LangGraph, LangChain, Groq API (`openai/gpt-oss-120b`, `openai/gpt-oss-20b`)
- **Deployment**: Docker, Render

---

## 📄 License

MIT License. Free to use and modify.
