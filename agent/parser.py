import re
from pathlib import Path
from agent.tools import set_active_project, safe_path_for_project

def apply_direct_file_edits(project_name: str, text: str) -> list[str]:
    """
    Parses code blocks formatted like:
    ### File: style.css
    ```css
    ...
    ```
    or ```css title="style.css"
    or looks for file paths right before or inside code fences.
    Writes them directly to the project folder.
    Returns list of modified filenames.
    """
    p_dir = set_active_project(project_name)
    modified = []

    # Pattern 1: ### File: filename or **File: filename** or File: filename
    pattern1 = re.compile(
        r'(?:###?\s*(?:File:?\s*)?|\*\*File:?\s*\*?|File:\s*)([a-zA-Z0-9_\-\.\/]+\.[a-zA-Z0-9]+)\s*\n+```[a-zA-Z]*\n(.*?)```',
        re.DOTALL
    )

    for match in pattern1.finditer(text):
        fname = match.group(1).strip().lstrip("/")
        content = match.group(2)
        try:
            target = safe_path_for_project(fname, base_dir=p_dir)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content, encoding="utf-8")
            modified.append(fname)
        except Exception as e:
            print(f"[apply_direct_file_edits] error writing {fname}: {e}")

    # Pattern 2: ```html title="index.html" or ```javascript file="script.js"
    pattern2 = re.compile(
        r'```[a-zA-Z]*\s+(?:title|file|path)=["\']?([a-zA-Z0-9_\-\.\/]+\.[a-zA-Z0-9]+)["\']?\n(.*?)```',
        re.DOTALL
    )
    for match in pattern2.finditer(text):
        fname = match.group(1).strip().lstrip("/")
        if fname not in modified:
            content = match.group(2)
            try:
                target = safe_path_for_project(fname, base_dir=p_dir)
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(content, encoding="utf-8")
                modified.append(fname)
            except Exception as e:
                print(f"[apply_direct_file_edits] error writing {fname}: {e}")

    return modified
