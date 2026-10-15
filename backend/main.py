"""
FastAPI Production & Deployment Backend:
- No authentication (frictionless, 0-cost)
- Multi-project workspace stored in gitignored storage/projects/
- Bulletproof In-place chat refinement (hybrid Tool-call + Direct Markdown Code Extraction fallback)
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
from agent.parser import apply_direct_file_edits
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
# In-Project Chat Refinement (Robust Tool-Call + Direct Markdown Extraction)
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
Refine, modify, or add files according to the user request.
FORMAT YOUR RESPONSE CAREFULLY:
For each file you modify or create, output a markdown section with the filename and complete code:
### File: filename.ext
```lang
[complete file content]
```

Example:
### File: style.css
```css
body {{ margin: 0; }}
```

Also, you can call write_file(path, content) if needed.
Ensure code is production-ready, fully functional, and well-aligned.
"""

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_msg}
    ]

    try:
        # First attempt via react_agent
        res = None
        try:
            res = await asyncio.to_thread(react_agent.invoke, {"messages": messages}, {"recursion_limit": 30})
        except Exception as tool_err:
            print(f"[react_agent fallback trigger] tool error: {tool_err}")

        # If react_agent produced output, extract text
        reply_text = ""
        if res and "messages" in res and res["messages"]:
            last_msg = res["messages"][-1]
            if hasattr(last_msg, "content") and last_msg.content:
                reply_text = last_msg.content

        # If react_agent failed due to JSON tool-call parse, invoke coder_llm directly
        if not reply_text:
            direct_res = await asyncio.to_thread(coder_llm.invoke, messages)
            reply_text = direct_res.content if hasattr(direct_res, "content") else str(direct_res)

        # Parse and write any direct markdown blocks to guarantee files are written
        modified_files = apply_direct_file_edits(project_name, reply_text)
        print(f"[chat] Successfully updated files: {modified_files}")

        clean_reply = re.sub(r'```.*?```', '[Updated code applied]', reply_text, flags=re.DOTALL).strip()
        if not clean_reply:
            clean_reply = f"Updated {', '.join(modified_files) if modified_files else 'project files'} successfully!"

        return {
            "success": True,
            "reply": clean_reply,
            "modified_files": modified_files,
            "version_saved": saved_v
        }
    except Exception as e:
        print(f"[Error in chat refinement] {e}")
        return {"error": str(e)}


# ---------------------------------------------------------------------------
# WebSocket: full build pipeline with Direct Markdown Extraction Fallback
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

    # Direct custom pipeline execution with real-time granular streaming
    try:
        from agent.graph import planner_llm, coder_llm, extract_json
        from agent.prompt import planner_prompt, architect_prompt, coder_system_prompt
        from agent.states import Plan, TaskPlan
        from agent.tools import read_file, write_file

        # 1. Planning Phase
        await ws.send_json({
            "type": "activity",
            "action": "planning",
            "phase": "planning",
            "status": "active",
            "message": "Planning application architecture & data flow...",
        })
        p_prompt = planner_prompt(user_prompt)
        p_msg = await asyncio.to_thread(planner_llm.invoke, p_prompt)
        p_raw = p_msg.content if hasattr(p_msg, "content") else str(p_msg)
        p_data = extract_json(p_raw)
        plan_obj = Plan(**p_data)

        await ws.send_json({
            "type": "step",
            "node": "planner",
            "data": {
                "plan": plan_obj.model_dump(),
                "activity": {
                    "action": "planning",
                    "status": "done",
                    "message": f"Planned {plan_obj.name} with {len(plan_obj.files)} file(s)",
                    "files": [f.path for f in plan_obj.files],
                }
            }
        })

        # 2. Architecting Phase
        await ws.send_json({
            "type": "activity",
            "action": "architecting",
            "phase": "architecting",
            "status": "active",
            "message": "Architecting step-by-step implementation tasks...",
        })
        a_prompt = architect_prompt(plan=plan_obj.model_dump_json())
        a_msg = await asyncio.to_thread(planner_llm.invoke, a_prompt)
        a_raw = a_msg.content if hasattr(a_msg, "content") else str(a_msg)
        a_data = extract_json(a_raw)
        task_plan_obj = TaskPlan(**a_data)

        steps = task_plan_obj.implementation_steps
        await ws.send_json({
            "type": "step",
            "node": "architect",
            "data": {
                "task_plan": task_plan_obj.model_dump(),
                "activity": {
                    "action": "architecting",
                    "status": "done",
                    "message": f"Architected {len(steps)} implementation steps",
                    "steps": [s.filepath for s in steps]
                }
            }
        })

        # 3. Coding Phase (File by file with Granular Status)
        for idx, task in enumerate(steps, start=1):
            filepath = task.filepath.lstrip("/")

            # Activity: Searching & Reading existing file
            await ws.send_json({
                "type": "activity",
                "action": "searching",
                "phase": "searching",
                "file": filepath,
                "step": idx,
                "total": len(steps),
                "message": f"Searching for existing file: {filepath}...",
            })
            await asyncio.sleep(0.05)

            existing = await asyncio.to_thread(read_file.func, filepath)
            has_existing = bool(existing.strip())
            
            await ws.send_json({
                "type": "activity",
                "action": "reading",
                "phase": "reading",
                "file": filepath,
                "has_existing": has_existing,
                "step": idx,
                "total": len(steps),
                "message": f"Reading file: {filepath} ({len(existing)} bytes found)" if has_existing else f"Reading file: {filepath} (new file)",
            })

            # Activity: Coding & Writing
            await ws.send_json({
                "type": "activity",
                "action": "coding",
                "phase": "coding",
                "file": filepath,
                "step": idx,
                "total": len(steps),
                "message": f"Coding {filepath} ({idx}/{len(steps)})...",
            })

            existing_preview = existing[:800] + "\n... (truncated)" if len(existing) > 800 else existing
            system_msg = f"Current File: {filepath}\n\n{coder_system_prompt()}"
            user_msg = (
                f"Task: {task.task_description}\n"
                f"File: {filepath}\n"
                f"Existing content:\n{existing_preview}\n\n"
                "Call write_file(path, content) to save the complete file."
            )

            # Attempt 1: React Agent
            from agent.graph import react_agent
            generated = ""
            for attempt in range(2):
                try:
                    await asyncio.to_thread(
                        react_agent.invoke,
                        {
                            "messages": [
                                {"role": "system", "content": system_msg},
                                {"role": "user", "content": user_msg},
                            ]
                        },
                        {"recursion_limit": 20},
                    )
                except Exception as exc:
                    print(f"  [ws coder] attempt {attempt + 1} raised: {exc}")

                generated = await asyncio.to_thread(read_file.func, filepath)
                if generated.strip():
                    break

            # Attempt 2: Direct Markdown fallback if tool JSON failed
            if not generated.strip():
                try:
                    direct_prompt = (
                        f"{system_msg}\n\n"
                        f"Write the COMPLETE code for `{filepath}` inside a markdown code block:\n"
                        f"```{filepath.split('.')[-1]}\n"
                        f"[complete content]\n"
                        f"```\n"
                        f"Task: {task.task_description}"
                    )
                    resp = await asyncio.to_thread(coder_llm.invoke, direct_prompt)
                    content = resp.content if hasattr(resp, "content") else str(resp)
                    match = re.search(r'```(?:[a-zA-Z]*)\n(.*?)```', content, re.DOTALL)
                    code = match.group(1) if match else content
                    if code.strip():
                        await asyncio.to_thread(write_file.func, filepath, code.strip())
                        generated = code
                except Exception as direct_err:
                    print(f"  [ws coder] direct fallback error: {direct_err}")

            # Activity: Completed a file
            await ws.send_json({
                "type": "activity",
                "action": "completed_file",
                "phase": "completed_file",
                "file": filepath,
                "step": idx,
                "total": len(steps),
                "bytes": len(generated),
                "message": f"Completed file: {filepath} ({idx}/{len(steps)})",
            })

            # Emit step progress
            await ws.send_json({
                "type": "step",
                "node": "coder",
                "data": {
                    "coder_state": {
                        "task_plan": task_plan_obj.model_dump(),
                        "current_step_idx": idx,
                    },
                    "status": "DONE" if idx == len(steps) else "IN_PROGRESS",
                    "activity": {
                        "action": "completed_file",
                        "file": filepath,
                        "step": idx,
                        "total_steps": len(steps),
                        "message": f"Completed file: {filepath} ({idx}/{len(steps)})",
                    }
                }
            })

        await ws.send_json({"type": "done", "project_id": project_name})

    except Exception as exc:
        print(f"[ERROR in ws agent run] {exc}")
        import traceback
        traceback.print_exc()
        await ws.send_json({
            "type": "error",
            "code": "error",
            "message": str(exc),
            "retryable": True,
        })


# ---------------------------------------------------------------------------
# Production Frontend Static Serving (Single-container deployment)
# ---------------------------------------------------------------------------

FRONTEND_DIST = Path.cwd() / "frontend" / "dist"
if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="frontend")
