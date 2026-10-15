"""
Quick end-to-end test – runs the agent graph directly (no HTTP/WebSocket needed).
Run from the project root with:  python test_agent.py
"""
import os
from dotenv import load_dotenv

load_dotenv()

if not os.getenv("GROQ_API_KEY"):
    raise SystemExit("ERROR: GROQ_API_KEY not set. Add it to .env")

from agent.graph import agent  # noqa: E402

print("Running agent with test prompt …")
try:
    result = agent.invoke(
        {"user_prompt": "create a simple hello world html page"},
        {"recursion_limit": 50},
    )
    print("SUCCESS – final state keys:", list(result.keys()))
    status = result.get("status", "unknown")
    print("Status:", status)
except Exception as exc:
    import traceback
    print("FAILED:")
    traceback.print_exc()
