from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")
load_dotenv(ROOT / "config.env")


def _bool(name: str, default: str = "0") -> bool:
    return os.getenv(name, default).strip().lower() in {"1", "true", "yes", "on"}


SYSTEM_WS_URL = os.getenv("SYSTEM_WS_URL", "ws://127.0.0.1:3000/ws/hardware")
HARDWARE_TOKEN = os.getenv("HARDWARE_TOKEN", "change-this-hardware-token")
SENSOR_PORT = os.getenv("SENSOR_PORT", "/dev/serial0")
SENSOR_BAUD = int(os.getenv("SENSOR_BAUD", "57600"))
RELAY_PIN = int(os.getenv("RELAY_PIN", "17"))
RELAY_ACTIVE_HIGH = _bool("RELAY_ACTIVE_HIGH", "1")
RELAY_DURATION_MS = int(os.getenv("RELAY_DURATION_MS", "3000"))
_pid = os.getenv("PID_FILE", str(ROOT / "hardware-control.pid"))
PID_FILE = _pid if os.path.isabs(_pid) else str(ROOT / _pid)
SIMULATE = _bool("SIMULATE", "0")
SERIAL_READ_TIMEOUT_S = float(os.getenv("SERIAL_READ_TIMEOUT_S", "0.3"))
UART_IO_STUCK_S = float(os.getenv("UART_IO_STUCK_S", "10"))
UART_ERROR_FLUSH_THRESHOLD = int(os.getenv("UART_ERROR_FLUSH_THRESHOLD", "8"))
