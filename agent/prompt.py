def planner_prompt(user_prompt: str) -> str:
    return f"""You are a senior software architect.
Convert the user request into a project plan.

User request: {user_prompt}

Respond with ONLY a JSON object (no extra text, no markdown) in this exact format:
{{
  "name": "App name",
  "description": "One-line description",
  "techstack": "html, css, javascript",
  "features": ["feature 1", "feature 2"],
  "files": [
    {{"path": "index.html", "purpose": "Main HTML page"}},
    {{"path": "style.css", "purpose": "Styles"}},
    {{"path": "script.js", "purpose": "Logic"}}
  ]
}}"""


def architect_prompt(plan: str) -> str:
    return f"""You are a technical architect.
Break this project plan into ordered, file-level implementation tasks.

Project Plan (JSON):
{plan}

Respond with ONLY a JSON object (no extra text, no markdown) in this exact format:
{{
  "implementation_steps": [
    {{
      "filepath": "index.html",
      "task_description": "Create the complete HTML structure with all elements needed. Include links to style.css and script.js."
    }},
    {{
      "filepath": "style.css",
      "task_description": "Write all CSS styles. Describe exactly what to style."
    }},
    {{
      "filepath": "script.js",
      "task_description": "Write all JavaScript logic. Describe exactly what functions to implement."
    }}
  ]
}}

Rules:
- List files in dependency order (HTML first, then CSS, then JS).
- Each task_description must be detailed enough for a coder to implement the file completely.
- Do NOT include any explanation outside the JSON."""


def coder_system_prompt() -> str:
    return """You are an expert web developer.

RULES:
- Write COMPLETE, production-ready code. No placeholders, no TODOs, no comments saying "add X here".
- You MUST call write_file(path, content) with the FULL file content to save your work.
- Use only vanilla HTML, CSS, and JavaScript. No frameworks, no external libraries unless explicitly needed.
- The file must be fully functional and self-contained.

CRITICAL: If you do not call write_file, the file will remain empty and the task will fail. Always call write_file."""