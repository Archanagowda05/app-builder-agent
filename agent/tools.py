import pathlib
from langchain_core.tools import tool

# Isolated storage directory (gitignored - never committed to codebase)
PROJECTS_ROOT = pathlib.Path.cwd() / "storage" / "projects"
PROJECTS_ROOT.mkdir(parents=True, exist_ok=True)

# Active project directory pointer
CURRENT_PROJECT_DIR = PROJECTS_ROOT / "kid-calculator"
CURRENT_PROJECT_DIR.mkdir(parents=True, exist_ok=True)


def set_active_project(project_name: str) -> pathlib.Path:
    global CURRENT_PROJECT_DIR
    clean_name = "".join(c for c in str(project_name) if c.isalnum() or c in ("-", "_")).strip() or "default"
    CURRENT_PROJECT_DIR = PROJECTS_ROOT / clean_name
    CURRENT_PROJECT_DIR.mkdir(parents=True, exist_ok=True)
    return CURRENT_PROJECT_DIR


def get_project_dir(project_name: str = None) -> pathlib.Path:
    if project_name:
        clean_name = "".join(c for c in str(project_name) if c.isalnum() or c in ("-", "_")).strip() or "default"
        p = PROJECTS_ROOT / clean_name
        p.mkdir(parents=True, exist_ok=True)
        return p
    return CURRENT_PROJECT_DIR


def safe_path_for_project(path: str, base_dir: pathlib.Path = None) -> pathlib.Path:
    target_root = (base_dir or CURRENT_PROJECT_DIR).resolve()
    path = path.lstrip("/").lstrip("\\")
    p = (target_root / path).resolve()
    if target_root not in p.parents and target_root != p.parent and target_root != p:
        raise ValueError("Attempt to access path outside project root")
    return p


@tool
def write_file(path: str, content: str) -> str:
    """Writes content to a file at the specified path within the active project root."""
    p = safe_path_for_project(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    with open(p, "w", encoding="utf-8") as f:
        f.write(content)
    return f"WROTE:{p.name}"


@tool
def read_file(path: str) -> str:
    """Reads content from a file at the specified path within the active project root."""
    p = safe_path_for_project(path)
    if not p.exists():
        return ""
    with open(p, "r", encoding="utf-8") as f:
        return f.read()


@tool
def get_current_directory() -> str:
    """Returns the current active project directory."""
    return str(CURRENT_PROJECT_DIR)


@tool
def list_files(directory: str = ".") -> str:
    """Lists all files in the specified directory within the active project root."""
    p = safe_path_for_project(directory)
    if not p.is_dir():
        return f"ERROR: {p} is not a directory"
    files = [str(f.relative_to(CURRENT_PROJECT_DIR)).replace("\\", "/") for f in p.glob("**/*") if f.is_file() and ".history" not in f.parts]
    return "\n".join(files) if files else "No files found."