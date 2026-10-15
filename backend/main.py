"""
FastAPI Production & Deployment Backend:
- No authentication (frictionless, 0-cost)
- Multi-project workspace stored in gitignored storage/projects/
- In-place chat refinement (Lovable-style)
- Per-project history snapshots and rollbacks in .history/
- Dynamic preview serving
- WebSocket agent pipeline
- Production static frontend build mounting
"""

import asyncio
import json
import os
import queue
import re
import shutil
import threading
import time
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from agent.graph import agent, planner_llm, coder_llm, react_agent
from agent.prompt import coder_system_prompt
from agent.tools import (
    PROJECTS_ROOT,
    get_project_dir,
    set_active_project,
    safe_path_for_project,
    read_file,
    write_file,
)

app = FastAPI(title="App Builder Agent API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

PROJECTS_ROOT.mkdir(parents=True, exist_ok=True)


def backup_project_version(project_name: str, reason: str = "snapshot") -> str:
    p_dir = get_project_dir(project_name)
    history_dir = p_dir / ".history"
    history_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    v_folder = history_dir / f"{timestamp}_{reason}"

    files_to_copy = [f for f in p_dir.iterdir() if f.name != ".history"]
    if files_to_copy:
        v_folder.mkdir(parents=True, exist_ok=True)
        for item in files_to_copy:
            if item.is_file():
                shutil.copy2(item, v_folder / item.name)
            elif item.is_dir():
                shutil.copytree(item, v_folder / item.name)
        return v_folder.name
    return ""


# ---------------------------------------------------------------------------
# Project Management
# ---------------------------------------------------------------------------

@app.get("/api/projects")
def list_projects():
    projects = []
    for item in sorted(PROJECTS_ROOT.iterdir(), key=lambda x: x.stat().st_mtime, reverse=True):
        if item.is_dir() and not item.name.startswith("."):
            files = [str(f.relative_to(item)).replace("\\", "/") for f in item.glob("**/*") if f.is_file() and ".history" not in f.parts]
            mtime = datetime.fromtimestamp(item.stat().st_mtime).strftime("%b %d, %H:%M")
            projects.append({
                "id": item.name,
                "name": item.name.replace("-", " ").title(),
                "file_count": len(files),
                "updated_at": mtime,
            })
    return {"projects": projects}


class CreateProjectRequest(BaseModel):
    name: str


@app.post("/api/projects")
def create_project(req: CreateProjectRequest):
    p_dir = set_active_project(req.name)
    return {"id": p_dir.name, "name": p_dir.name.replace("-", " ").title()}


# ---------------------------------------------------------------------------
# Per-project file browsing
# ---------------------------------------------------------------------------

@app.get("/api/files")
def list_files(project: str = "kid-calculator"):
    p_dir = get_project_dir(project)
    if not p_dir.exists():
        return {"files": []}
    files = [
        str(f.relative_to(p_dir)).replace("\\", "/")
        for f in p_dir.glob("**/*")
        if f.is_file() and ".history" not in f.parts
    ]
    return {"files": sorted(files)}


@app.get("/api/files/content")
def file_content(path: str, project: str = "kid-calculator"):
    p_dir = get_project_dir(project)
    p = safe_path_for_project(path, base_dir=p_dir)

    if not p.exists() or not p.is_file():
        return {"error": "not found"}

    try:
        content = p.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return {"error": "binary file, cannot display"}

    return {"path": path, "content": content}


# ---------------------------------------------------------------------------
# Live preview mount
# ---------------------------------------------------------------------------

app.mount("/preview", StaticFiles(directory=str(PROJECTS_ROOT), html=True), name="preview")


@app.get("/api/preview/entry")
def preview_entry(project: str = "kid-calculator"):
    p_dir = get_project_dir(project)
    candidates = ["index.html", "Index.html"]
    for name in candidates:
        if (p_dir / name).exists():
            return {"entry": f"/preview/{p_dir.name}/{name}?t={_cache_bust()}"}

    html_files = [f for f in p_dir.glob("*.html") if ".history" not in f.parts]
    if html_files:
        return {"entry": f"/preview/{p_dir.name}/{html_files[0].name}?t={_cache_bust()}"}

    return {"entry": None}


def _cache_bust() -> str:
    return str(int(time.time() * 1000))


# ---------------------------------------------------------------------------
# Version History / Snapshots API per project
# ---------------------------------------------------------------------------

@app.get("/api/history")
def get_project_history(project: str = "kid-calculator"):
    p_dir = get_project_dir(project)
    history_dir = p_dir / ".history"
    if not history_dir.exists():
        return {"versions": []}
    versions = []
    for item in sorted(history_dir.iterdir(), reverse=True):
        if item.is_dir():
            file_count = sum(1 for f in item.glob("**/*") if f.is_file())
            ctime = datetime.fromtimestamp(item.stat().st_ctime).strftime("%b %d, %H:%M:%S")
            versions.append({
                "id": item.name,
                "name": item.name,
                "file_count": file_count,
                "created_at": ctime,
            })
    return {"versions": versions}


class RestoreVersionRequest(BaseModel):
    project: str
    version_id: str


@app.post("/api/history/restore")
def restore_project_version(req: RestoreVersionRequest):
    p_dir = get_project_dir(req.project)
    src = p_dir / ".history" / req.version_id
    if not src.exists() or not src.is_dir():
        return {"error": "Version not found"}

    backup_project_version(req.project, "before_restore")

    for f in p_dir.iterdir():
        if f.name != ".history":
            if f.is_file():
                f.unlink()
            elif f.is_dir():
                shutil.rmtree(f)

    for item in src.iterdir():
        if item.is_file():
            shutil.copy2(item, p_dir / item.name)
        elif item.is_dir():
            shutil.copytree(item, p_dir / item.name)

    return {"success": True, "restored": req.version_id}


# ---------------------------------------------------------------------------
# In-Project Chat Refinement (Lovable style in-place modifying)
# ---------------------------------------------------------------------------

class ChatRequest(BaseModel):
    project: str = "kid-calculator"
    message: str


@app.post("/api/chat")
async def chat_modify_project(req: ChatRequest):
    user_msg = req.message.strip()
    if not user_msg:
        return {"error": "Empty message"}

    project_name = req.project or "kid-calculator"
    p_dir = set_active_project(project_name)

    saved_v = backup_project_version(project_name, "chat_edit")

    current_files = {}
    for f in p_dir.glob("**/*"):
        if f.is_file() and ".history" not in f.parts:
            rel = str(f.relative_to(p_dir)).replace("\\", "/")
            try:
                current_files[rel] = f.read_text(encoding="utf-8")
            except Exception:
                pass

    files_summary = ""
    for name, content in current_files.items():
        files_summary += f"\n--- File: {name} ---\n{content}\n"

    system_prompt = f"""You are an expert full-stack developer assisting a user in refining their live web project.

Project directory: {p_dir.name}
Current files:
{files_summary}

YOUR TASK:
Refine or fix the project according to the user's instructions.
CRITICAL RULES:
1. Whenever you modify or add a file, you MUST use the write_file(path, content) tool with the FULL complete file content! Never write partial code.
2. Maintain high quality styling, alignment, and responsiveness.
3. Once you're done writing the updated files, output a clear, friendly summary of what you fixed or changed for the user.
"""

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_msg}
    ]

    try:
        res = await asyncio.to_thread(react_agent.invoke, {"messages": messages}, {"recursion_limit": 30})
        reply = "Updated project successfully."
        if "messages" in res and res["messages"]:
            last_msg = res["messages"][-1]
            if hasattr(last_msg, "content") and last_msg.content:
                reply = last_msg.content
        return {
            "success": True,
            "reply": reply,
            "version_saved": saved_v
        }
    except Exception as e:
        print(f"[Error in chat refinement] {e}")
        return {"error": str(e)}


# ---------------------------------------------------------------------------
# WebSocket: full build pipeline
# ---------------------------------------------------------------------------

def _serialize_value(value):
    if hasattr(value, "model_dump"):
        return value.model_dump()
    if isinstance(value, dict):
        return {k: _serialize_value(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_serialize_value(v) for v in value]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


def _serialize_step(node_name: str, node_output: dict) -> dict:
    return {
        "type": "step",
        "node": node_name,
        "data": {k: _serialize_value(v) for k, v in node_output.items()},
    }


@app.websocket("/ws/run")
async def run_agent(ws: WebSocket):
    await ws.accept()

    try:
        init_msg = await ws.receive_json()
    except WebSocketDisconnect:
        return

    user_prompt = init_msg.get("user_prompt", "")
    project_name = init_msg.get("project_name", "")
    recursion_limit = init_msg.get("recursion_limit", 50)

    if not user_prompt.strip():
        await ws.send_json({
            "type": "error",
            "code": "bad_request",
            "message": "Please describe the project you'd like to generate.",
            "retryable": True,
        })
        await ws.close()
        return

    if not project_name:
        words = re.findall(r"\b[a-zA-Z]{3,}\b", user_prompt.lower())
        project_name = "-".join(words[:3]) or f"app-{int(time.time())}"

    set_active_project(project_name)
    backup_project_version(project_name, "initial")

    await ws.send_json({"type": "project_info", "project_id": project_name})

    q: "queue.Queue" = queue.Queue()
    SENTINEL = object()

    def worker():
        try:
            for step in agent.stream(
                {"user_prompt": user_prompt},
                {"recursion_limit": recursion_limit},
            ):
                q.put(step)
        except Exception as exc:
            print(f"[ERROR in worker] {exc}")
            import traceback
            traceback.print_exc()
            q.put({"__error__": str(exc)})
        finally:
            q.put(SENTINEL)

    threading.Thread(target=worker, daemon=True).start()

    loop = asyncio.get_event_loop()

    try:
        while True:
            item = await loop.run_in_executor(None, q.get)

            if item is SENTINEL:
                break

            if "__error__" in item:
                await ws.send_json({
                    "type": "error",
                    "code": "error",
                    "message": item["__error__"],
                    "retryable": True,
                })
                break

            for node_name, node_output in item.items():
                await ws.send_json(_serialize_step(node_name, node_output))

        await ws.send_json({"type": "done", "project_id": project_name})
    except WebSocketDisconnect:
        pass
    finally:
        try:
            await ws.close()
        except RuntimeError:
            pass


# ---------------------------------------------------------------------------
# Production Frontend Static Serving (Single-container deployment)
# ---------------------------------------------------------------------------

FRONTEND_DIST = Path.cwd() / "frontend" / "dist"
if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="frontend")
