from __future__ import annotations

import hashlib
import queue
import threading
import time
from typing import Callable, Optional

try:
    from pyfingerprint.pyfingerprint import (
        FINGERPRINT_CHARBUFFER1,
        FINGERPRINT_CHARBUFFER2,
        PyFingerprint,
    )
except ImportError:  # pragma: no cover
    FINGERPRINT_CHARBUFFER1 = 0x01
    FINGERPRINT_CHARBUFFER2 = 0x02
    PyFingerprint = None  # type: ignore


ProgressCb = Callable[[str], None]
StopFn = Callable[[], bool]


class FingerprintError(Exception):
    pass


class FingerprintSensor:
    def search(self, should_stop: StopFn) -> int:
        raise NotImplementedError

    def enroll(self, should_stop: StopFn, progress: ProgressCb) -> tuple[int, str]:
        raise NotImplementedError

    def store_template_bytes(self, position: int, template: list[int]) -> None:
        raise NotImplementedError

    def load_template_bytes(self, position: int) -> list[int]:
        raise NotImplementedError

    def delete(self, position: int) -> None:
        raise NotImplementedError

    def close(self) -> None:
        return None


class As608Sensor(FingerprintSensor):
    def __init__(self, port: str, baud: int, name: str) -> None:
        if PyFingerprint is None:
            raise FingerprintError("pyfingerprint tidak terpasang")
        self.name = name
        self.port = port
        self.io_lock = threading.RLock()
        self._f = PyFingerprint(port, baud, 0xFFFFFFFF, 0x00000000)
        if not self._f.verifyPassword():
            raise FingerprintError(f"Password sensor {name} tidak valid")
        print(f"[{name}] sensor ready on {port} @ {baud}", flush=True)

    def _wait_image(self, should_stop: StopFn, timeout_s: float) -> bool:
        if timeout_s > 2:
            print(f"[{self.name}] waiting for finger ({timeout_s:.0f}s)…", flush=True)
        deadline = time.monotonic() + timeout_s
        last_err = 0.0
        while time.monotonic() < deadline:
            if should_stop():
                return False
            try:
                if self._f.readImage():
                    return True
            except Exception as exc:
                now = time.monotonic()
                if now - last_err > 2:
                    print(f"[{self.name}] readImage error: {exc}", flush=True)
                    last_err = now
                time.sleep(0.05)
            time.sleep(0.05)
        return False

    def _wait_remove(self, should_stop: StopFn, timeout_s: float = 15) -> None:
        deadline = time.monotonic() + timeout_s
        while time.monotonic() < deadline:
            if should_stop():
                return
            try:
                if not self._f.readImage():
                    return
            except Exception:
                return
            time.sleep(0.1)

    def search(self, should_stop: StopFn) -> int:
        with self.io_lock:
            if not self._wait_image(should_stop, timeout_s=0.8):
                return -2  # no finger / paused
            self._f.convertImage(FINGERPRINT_CHARBUFFER1)
            position, _accuracy = self._f.searchTemplate()
            return int(position)

    def _next_free(self) -> int:
        for page in range(0, 4):
            used = self._f.getTemplateIndex(page)
            for index, is_used in enumerate(used):
                if not is_used:
                    return page * 32 + index
        raise FingerprintError("Kapasitas sensor penuh")

    def enroll(self, should_stop: StopFn, progress: ProgressCb) -> tuple[int, str]:
        with self.io_lock:
            progress("place_finger")
            if not self._wait_image(should_stop, 45):
                if should_stop():
                    raise FingerprintError("Enroll dibatalkan")
                raise FingerprintError("Timeout menunggu jari pertama")
            self._f.convertImage(FINGERPRINT_CHARBUFFER1)
            found, _ = self._f.searchTemplate()
            if found >= 0:
                raise FingerprintError(f"Sidik jari sudah terdaftar di slot {found}")

            progress("remove_finger")
            self._wait_remove(should_stop)

            progress("place_again")
            if not self._wait_image(should_stop, 45):
                if should_stop():
                    raise FingerprintError("Enroll dibatalkan")
                raise FingerprintError("Timeout menunggu jari kedua")
            self._f.convertImage(FINGERPRINT_CHARBUFFER2)
            if self._f.compareCharacteristics() == 0:
                raise FingerprintError("Kedua pembacaan jari tidak cocok")

            progress("storing")
            self._f.createTemplate()
            position = self._next_free()
            self._f.storeTemplate(position, FINGERPRINT_CHARBUFFER1)
            template = self.load_template_bytes(position)
            password_hash = hashlib.sha256(bytes(template)).hexdigest()
            return position, password_hash

    def load_template_bytes(self, position: int) -> list[int]:
        with self.io_lock:
            self._f.loadTemplate(position, FINGERPRINT_CHARBUFFER1)
            return list(self._f.downloadCharacteristics(FINGERPRINT_CHARBUFFER1))

    def store_template_bytes(self, position: int, template: list[int]) -> None:
        with self.io_lock:
            self._f.uploadCharacteristics(FINGERPRINT_CHARBUFFER1, template)
            self._f.storeTemplate(position, FINGERPRINT_CHARBUFFER1)

    def delete(self, position: int) -> None:
        with self.io_lock:
            self._f.deleteTemplate(position)


class SimulateSensor(FingerprintSensor):
    """In-memory AS608 stand-in for development without Raspberry Pi hardware."""

    store: dict[str, dict[int, list[int]]] = {"access": {}}

    def __init__(self, name: str, trigger_queue) -> None:
        self.name = name
        self.io_lock = threading.Lock()
        self._trigger_queue = trigger_queue

    def search(self, should_stop: StopFn) -> int:
        try:
            fingerprint_id = self._trigger_queue.get(timeout=0.3)
        except queue.Empty:
            return -2
        if should_stop():
            return -2
        templates = self.store.get(self.name, {})
        if fingerprint_id == -1:
            return -1
        if fingerprint_id in templates:
            return fingerprint_id
        return -1

    def enroll(self, should_stop: StopFn, progress: ProgressCb) -> tuple[int, str]:
        for step, delay in (("place_finger", 0.4), ("remove_finger", 0.3), ("place_again", 0.4), ("storing", 0.3)):
            if should_stop():
                raise FingerprintError("Enroll dibatalkan")
            progress(step)
            time.sleep(delay)
        used = set(self.store["access"])
        position = next((i for i in range(0, 128) if i not in used), None)
        if position is None:
            raise FingerprintError("Kapasitas sensor penuh")
        template = list(hashlib.sha256(f"{self.name}:{position}:{time.time()}".encode()).digest()) * 2
        template = template[:512]
        self.store[self.name][position] = template
        password_hash = hashlib.sha256(bytes(template)).hexdigest()
        return position, password_hash

    def load_template_bytes(self, position: int) -> list[int]:
        template = self.store.get(self.name, {}).get(position)
        if not template:
            raise FingerprintError(f"Template {position} tidak ada di {self.name}")
        return list(template)

    def store_template_bytes(self, position: int, template: list[int]) -> None:
        self.store.setdefault(self.name, {})[position] = list(template)

    def delete(self, position: int) -> None:
        self.store.get(self.name, {}).pop(position, None)


def create_sensor(name: str, port: str, baud: int, simulate: bool, trigger_queue=None) -> FingerprintSensor:
    if simulate:
        return SimulateSensor(name, trigger_queue)
    return As608Sensor(port, baud, name)
