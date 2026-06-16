
import asyncio
import queue
import re
import threading

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from agent.graph import agent
from agent.tools import PROJECT_ROOT

app = FastAPI(title="Agent Code Generator API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten this for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# File browsing endpoints (read the generated_project directory)
# ---------------------------------------------------------------------------

@app.get("/api/files")
def list_files():
    """Return all files currently in the generated project, as relative paths."""
    root = PROJECT_ROOT.resolve()
    if not root.exists():
        return {"files": []}
    files = [str(f.relative_to(root)) for f in root.glob("**/*") if f.is_file()]
    return {"files": sorted(files)}


@app.get("/api/files/content")
def file_content(path: str):
    """Return the content of a single file inside the generated project."""
    root = PROJECT_ROOT.resolve()
    p = (root / path.lstrip("/")).resolve()

    if root != p and root not in p.parents:
        return {"error": "invalid path"}
    if not p.exists() or not p.is_file():
        return {"error": "not found"}

    try:
        content = p.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return {"error": "binary file, cannot display"}

    return {"path": path, "content": content}


# ---------------------------------------------------------------------------
# Live preview: serve generated_project/ as static files at /preview/*
# so the frontend can show the actual rendered app in an iframe.
# ---------------------------------------------------------------------------

PROJECT_ROOT.mkdir(parents=True, exist_ok=True)
app.mount("/preview", StaticFiles(directory=str(PROJECT_ROOT), html=True), name="preview")


@app.get("/api/preview/entry")
def preview_entry():
    """Tell the frontend which file to load as the preview root (usually index.html)."""
    root = PROJECT_ROOT.resolve()
    candidates = ["index.html", "Index.html"]
    for name in candidates:
        if (root / name).exists():
            return {"entry": f"/preview/{name}?t={_cache_bust()}"}

    html_files = list(root.glob("*.html"))
    if html_files:
        return {"entry": f"/preview/{html_files[0].name}?t={_cache_bust()}"}

    return {"entry": None}


def _cache_bust() -> str:
    import time
    return str(int(time.time() * 1000))


# ---------------------------------------------------------------------------
# Helpers to make LangGraph output JSON-serializable
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


# ---------------------------------------------------------------------------
# Friendly error classification
# ---------------------------------------------------------------------------

# Groq / OpenAI-style rate limit and quota error signatures.
_RATE_LIMIT_PATTERNS = [
    r"rate.?limit",
    r"too many requests",
    r"429",
    r"quota",
    r"requests per (minute|day|second)",
    r"tokens per (minute|day|second)",
]
_RATE_LIMIT_RE = re.compile("|".join(_RATE_LIMIT_PATTERNS), re.IGNORECASE)

_AUTH_PATTERNS = [r"401", r"403", r"invalid api key", r"unauthorized", r"authentication"]
_AUTH_RE = re.compile("|".join(_AUTH_PATTERNS), re.IGNORECASE)

_TIMEOUT_PATTERNS = [r"timeout", r"timed out", r"connection (error|reset)"]
_TIMEOUT_RE = re.compile("|".join(_TIMEOUT_PATTERNS), re.IGNORECASE)


def classify_error(raw_message: str) -> dict:
    """
    Turn a raw exception string into a user-facing error the frontend can
    render nicely, instead of a stack trace / SDK error blob.
    """
    if _RATE_LIMIT_RE.search(raw_message):
        return {
            "code": "rate_limited",
            "message": "Usage limit reached. Please try again in a little while.",
            "retryable": True,
        }
    if _AUTH_RE.search(raw_message):
        return {
            "code": "auth_error",
            "message": "There's a problem with the API credentials on the server. Please check the backend configuration.",
            "retryable": False,
        }
    if _TIMEOUT_RE.search(raw_message):
        return {
            "code": "timeout",
            "message": "The request took too long and timed out. Please try again.",
            "retryable": True,
        }
    return {
        "code": "unknown",
        "message": "Something went wrong while generating your project. Please try again.",
        "retryable": True,
    }


# ---------------------------------------------------------------------------
# WebSocket: run the agent and stream node-by-node updates
# ---------------------------------------------------------------------------

@app.websocket("/ws/run")
async def run_agent(ws: WebSocket):
    await ws.accept()

    try:
        init_msg = await ws.receive_json()
    except WebSocketDisconnect:
        return

    user_prompt = init_msg.get("user_prompt", "")
    recursion_limit = init_msg.get("recursion_limit", 100)

    if not user_prompt.strip():
        friendly = classify_error("")
        await ws.send_json({
            "type": "error",
            "code": "bad_request",
            "message": "Please describe the project you'd like to generate.",
            "retryable": True,
        })
        await ws.close()
        return

    q: "queue.Queue" = queue.Queue()
    SENTINEL = object()

    def worker():
        try:
            for step in agent.stream(
                {"user_prompt": user_prompt},
                {"recursion_limit": recursion_limit},
            ):
                q.put(step)
        except Exception as exc:  # surface graph errors to the client, classified
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
                friendly = classify_error(item["__error__"])
                await ws.send_json({"type": "error", **friendly})
                break

            for node_name, node_output in item.items():
                await ws.send_json(_serialize_step(node_name, node_output))

        await ws.send_json({"type": "done"})
    except WebSocketDisconnect:
        pass
    finally:
        try:
            await ws.close()
        except RuntimeError:
            pass
