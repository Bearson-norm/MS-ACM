from __future__ import annotations

import atexit
import os
import sys
from pathlib import Path


def _pid_alive(pid: int) -> bool:
    if pid <= 0:
        return False
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False
    except AttributeError:
        return False


def acquire_pid(pid_file: str) -> None:
    path = Path(pid_file)
    if path.exists():
        try:
            existing = int(path.read_text(encoding="utf-8").strip() or "0")
        except ValueError:
            existing = 0
        if existing and _pid_alive(existing) and existing != os.getpid():
            print(f"Hardware-control already running (pid {existing}). Exiting.", file=sys.stderr)
            sys.exit(1)
    path.write_text(str(os.getpid()), encoding="utf-8")

    def _release() -> None:
        try:
            if path.exists() and path.read_text(encoding="utf-8").strip() == str(os.getpid()):
                path.unlink()
        except OSError:
            pass

    atexit.register(_release)
