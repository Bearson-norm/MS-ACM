from __future__ import annotations

import threading
import time
from typing import Optional

try:
    from gpiozero import OutputDevice
except ImportError:  # pragma: no cover
    OutputDevice = None


class Relay:
    def __init__(self, pin: int, active_high: bool, lock: threading.Lock, simulate: bool = False) -> None:
        self._lock = lock
        self._simulate = simulate or OutputDevice is None
        self._device: Optional[object] = None
        if not self._simulate:
            self._device = OutputDevice(pin, active_high=active_high, initial_value=False)

    def pulse(self, duration_ms: int) -> bool:
        acquired = self._lock.acquire(blocking=False)
        if not acquired:
            return False
        try:
            self._on()
            time.sleep(max(duration_ms, 1) / 1000.0)
            self._off()
            return True
        finally:
            self._off()
            self._lock.release()

    def _on(self) -> None:
        if self._device is not None:
            self._device.on()

    def _off(self) -> None:
        if self._device is not None:
            self._device.off()

    def close(self) -> None:
        if self._device is not None:
            try:
                self._device.off()
                self._device.close()
            except Exception:
                pass
