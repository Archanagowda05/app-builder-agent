"""
LangGraph agent pipeline: Planner → Architect → Coder
- Planner & Architect use gpt-oss-20b with manual JSON extraction
  (the model returns valid JSON in markdown blocks but doesn't support tool-call structured output)
- Coder uses gpt-oss-120b via the react_agent (it supports tool calls)
"""

import json
import re

from dotenv import load_dotenv
from langchain_groq import ChatGroq
from langgraph.constants import END
from langgraph.graph import StateGraph
from langgraph.prebuilt import create_react_agent

from agent.prompt import architect_prompt, coder_system_prompt, planner_prompt
from agent.states import CoderState, Plan, TaskPlan
from agent.tools import get_current_directory, list_files, read_file, write_file

# ---------------------------------------------------------------------------
# Environment
# ---------------------------------------------------------------------------
load_dotenv()

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
planner_llm = ChatGroq(model="openai/gpt-oss-20b")   # cheap + fast for planning
coder_llm   = ChatGroq(model="openai/gpt-oss-120b")  # strongest available for coding

# ---------------------------------------------------------------------------
# React agent for the Coder node
# run_cmd intentionally excluded (security risk)
# ---------------------------------------------------------------------------
coder_tools = [read_file, write_file, list_files, get_current_directory]
react_agent = create_react_agent(coder_llm, coder_tools)


# ---------------------------------------------------------------------------
# Helper: extract JSON from model output (handles ```json … ``` blocks)
# ---------------------------------------------------------------------------

def extract_json(text: str) -> dict:
    """Pull the first JSON object out of a (possibly markdown-wrapped) string."""
    # Strip ```json ... ``` fences
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fenced:
        return json.loads(fenced.group(1))
    # Try bare JSON object
    bare = re.search(r"\{.*\}", text, re.DOTALL)
    if bare:
        return json.loads(bare.group(0))
    raise ValueError(f"No JSON found in model output:\n{text[:500]}")


# ---------------------------------------------------------------------------
# Graph nodes
# ---------------------------------------------------------------------------

def planner_node(state: dict) -> dict:
    """Convert the user's free-text prompt into a structured Plan."""
    user_prompt = state["user_prompt"]

    prompt_text = planner_prompt(user_prompt)
    msg = planner_llm.invoke(prompt_text)
    raw = msg.content if hasattr(msg, "content") else str(msg)

    try:
        data = extract_json(raw)
        resp = Plan(**data)
    except Exception as exc:
        raise ValueError(f"Planner JSON parse failed: {exc}\nRaw output:\n{raw[:800]}") from exc

    return {"plan": resp}


def architect_node(state: dict) -> dict:
    """Expand the Plan into an ordered list of file-level implementation tasks."""
    plan: Plan = state["plan"]

    prompt_text = architect_prompt(plan=plan.model_dump_json())
    msg = planner_llm.invoke(prompt_text)
    raw = msg.content if hasattr(msg, "content") else str(msg)

    try:
        data = extract_json(raw)
        resp = TaskPlan(**data)
    except Exception as exc:
        raise ValueError(f"Architect JSON parse failed: {exc}\nRaw output:\n{raw[:800]}") from exc

    print(f"[architect] {len(resp.implementation_steps)} steps planned")
    return {"task_plan": resp}


def coder_node(state: dict) -> dict:
    """Execute one implementation step at a time using the react agent."""
    coder_state: CoderState = state.get("coder_state")
    if coder_state is None:
        coder_state = CoderState(
            task_plan=state["task_plan"],
            current_step_idx=0,
        )

    steps = coder_state.task_plan.implementation_steps

    # Deterministic termination check
    if coder_state.current_step_idx >= len(steps):
        return {"coder_state": coder_state, "status": "DONE"}

    current_task = steps[coder_state.current_step_idx]
    filepath = current_task.filepath.lstrip("/")

    # Read existing content, trim to save tokens
    existing = read_file.func(filepath)
    if len(existing) > 800:
        existing = existing[:800] + "\n... (truncated)"

    system_msg = f"Current File: {filepath}\n\n{coder_system_prompt()}"
    user_msg = (
        f"Task: {current_task.task_description}\n"
        f"File: {filepath}\n"
        f"Existing content:\n{existing}\n\n"
        "Call write_file(path, content) to save the complete file."
    )

    print(f"[coder] step {coder_state.current_step_idx + 1}/{len(steps)}: {filepath}")

    # Attempt with one retry
    generated = ""
    for attempt in range(2):
        try:
            react_agent.invoke(
                {
                    "messages": [
                        {"role": "system", "content": system_msg},
                        {"role": "user",   "content": user_msg},
                    ]
                },
                {"recursion_limit": 20},
            )
        except Exception as exc:
            print(f"  [coder] attempt {attempt + 1} raised: {exc}")

        generated = read_file.func(filepath)
        if generated.strip():
            print(f"  [coder] OK {filepath} written ({len(generated)} chars)")
            break
        print(f"  [coder] attempt {attempt + 1} - no content written for {filepath}")

    if not generated.strip():
        print(f"  [coder] WARNING: skipping {filepath} after retries")

    coder_state.current_step_idx += 1
    return {"coder_state": coder_state, "status": "IN_PROGRESS"}


# ---------------------------------------------------------------------------
# Deterministic routing (pure Python, no LLM)
# ---------------------------------------------------------------------------

def should_continue(state: dict) -> str:
    return "end" if state.get("status") == "DONE" else "coder"


# ---------------------------------------------------------------------------
# Build the graph
# ---------------------------------------------------------------------------

graph = StateGraph(dict)
graph.add_node("planner",   planner_node)
graph.add_node("architect", architect_node)
graph.add_node("coder",     coder_node)

graph.add_edge("planner",   "architect")
graph.add_edge("architect", "coder")
graph.add_conditional_edges(
    "coder",
    should_continue,
    {"end": END, "coder": "coder"},
)

graph.set_entry_point("planner")
agent = graph.compile()


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    prompt = input("Enter your project prompt: ")
    result = agent.invoke(
        {"user_prompt": prompt},
        {"recursion_limit": 100},
    )
    print("Final State keys:", list(result.keys()))
    print("Status:", result.get("status"))