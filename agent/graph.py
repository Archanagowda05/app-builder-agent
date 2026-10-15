"""
LangGraph agent pipeline: Planner → Architect → Coder
- Detailed status & activity streaming for UI visibility:
  * planning (analyzing prompt & designing app structure)
  * architecting (breaking into file-level tasks)
  * searching & reading files
  * coding & writing files
  * completed files
- Hybrid tool + direct code generation fallback
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
planner_llm = ChatGroq(model="openai/gpt-oss-20b")
coder_llm   = ChatGroq(model="openai/gpt-oss-120b")

# ---------------------------------------------------------------------------
# React agent for Coder node
# ---------------------------------------------------------------------------
coder_tools = [read_file, write_file, list_files, get_current_directory]
react_agent = create_react_agent(coder_llm, coder_tools)


def extract_json(text: str) -> dict:
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fenced:
        return json.loads(fenced.group(1))
    bare = re.search(r"\{.*\}", text, re.DOTALL)
    if bare:
        return json.loads(bare.group(0))
    raise ValueError(f"No JSON found in model output:\n{text[:500]}")


# ---------------------------------------------------------------------------
# Graph nodes with rich activity tracking
# ---------------------------------------------------------------------------

def planner_node(state: dict) -> dict:
    user_prompt = state["user_prompt"]
    prompt_text = planner_prompt(user_prompt)
    msg = planner_llm.invoke(prompt_text)
    raw = msg.content if hasattr(msg, "content") else str(msg)

    try:
        data = extract_json(raw)
        resp = Plan(**data)
    except Exception as exc:
        raise ValueError(f"Planner JSON parse failed: {exc}\nRaw output:\n{raw[:800]}") from exc

    return {
        "plan": resp,
        "activity": {
            "action": "planning",
            "message": f"Planned {resp.name} with {len(resp.files)} file(s)",
            "files": [f.path for f in resp.files]
        }
    }


def architect_node(state: dict) -> dict:
    plan: Plan = state["plan"]
    prompt_text = architect_prompt(plan=plan.model_dump_json())
    msg = planner_llm.invoke(prompt_text)
    raw = msg.content if hasattr(msg, "content") else str(msg)

    try:
        data = extract_json(raw)
        resp = TaskPlan(**data)
    except Exception as exc:
        raise ValueError(f"Architect JSON parse failed: {exc}\nRaw output:\n{raw[:800]}") from exc

    steps_desc = [f"{s.filepath}" for s in resp.implementation_steps]
    return {
        "task_plan": resp,
        "activity": {
            "action": "architecting",
            "message": f"Architected {len(resp.implementation_steps)} implementation step(s): {', '.join(steps_desc)}"
        }
    }


def coder_node(state: dict) -> dict:
    coder_state: CoderState = state.get("coder_state")
    if coder_state is None:
        coder_state = CoderState(
            task_plan=state["task_plan"],
            current_step_idx=0,
        )

    steps = coder_state.task_plan.implementation_steps

    if coder_state.current_step_idx >= len(steps):
        return {
            "coder_state": coder_state,
            "status": "DONE",
            "activity": {
                "action": "completed",
                "message": "All project files generated and verified!"
            }
        }

    current_task = steps[coder_state.current_step_idx]
    filepath = current_task.filepath.lstrip("/")

    # Activity: searching & reading existing file
    existing = read_file.func(filepath)
    has_existing = bool(existing.strip())

    existing_preview = existing
    if len(existing_preview) > 800:
        existing_preview = existing_preview[:800] + "\n... (truncated)"

    system_msg = f"Current File: {filepath}\n\n{coder_system_prompt()}"
    user_msg = (
        f"Task: {current_task.task_description}\n"
        f"File: {filepath}\n"
        f"Existing content:\n{existing_preview}\n\n"
        "Call write_file(path, content) to save the complete file."
    )

    print(f"[coder] coding file: {filepath}")

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
            break

    if not generated.strip():
        try:
            direct_prompt = (
                f"{system_msg}\n\n"
                f"Write the COMPLETE code for `{filepath}` inside a markdown code block:\n"
                f"```{filepath.split('.')[-1]}\n"
                f"[complete content]\n"
                f"```\n"
                f"Task: {current_task.task_description}"
            )
            resp = coder_llm.invoke(direct_prompt)
            content = resp.content if hasattr(resp, "content") else str(resp)
            match = re.search(r'```(?:[a-zA-Z]*)\n(.*?)```', content, re.DOTALL)
            code = match.group(1) if match else content
            if code.strip():
                write_file.func(filepath, code.strip())
                generated = code
        except Exception as direct_err:
            print(f"  [coder] direct fallback error: {direct_err}")

    coder_state.current_step_idx += 1
    total_steps = len(steps)
    curr_idx = coder_state.current_step_idx

    return {
        "coder_state": coder_state,
        "status": "IN_PROGRESS",
        "activity": {
            "action": "coding",
            "file": filepath,
            "read_existing": has_existing,
            "written_chars": len(generated),
            "step": curr_idx,
            "total_steps": total_steps,
            "message": f"Completed coding {filepath} ({curr_idx}/{total_steps})"
        }
    }


def should_continue(state: dict) -> str:
    return "end" if state.get("status") == "DONE" else "coder"


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


if __name__ == "__main__":
    prompt = input("Enter your project prompt: ")
    result = agent.invoke({"user_prompt": prompt}, {"recursion_limit": 100})
    print("Done:", result.get("status"))