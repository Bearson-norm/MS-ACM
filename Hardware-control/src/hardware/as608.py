from __future__ import annotations

import hashlib
import queue
import threading
import time
from contextlib import contextmanager
from typing import Callable, Iterator, Optional

import config

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
        self.baud = baud
        self.io_lock = threading.RLock()
        self._reset_lock = threading.Lock()
        self._uart_op_started: Optional[float] = None
        self._uart_error_streak = 0
        self._watchdog_stop = threading.Event()
        self._f = PyFingerprint(port, baud, 0xFFFFFFFF, 0x00000000)
        self._apply_serial_timeout()
        if not self._f.verifyPassword():
            raise FingerprintError(f"Password sensor {name} tidak valid")
        self._watchdog = threading.Thread(
            target=self._uart_watchdog_loop,
            name=f"uart-watchdog-{name}",
            daemon=True,
        )
        self._watchdog.start()
        print(f"[{name}] sensor ready on {port} @ {baud}", flush=True)

    def close(self) -> None:
        self._watchdog_stop.set()

    def _serial(self):
        return object.__getattribute__(self._f, "_PyFingerprint__serial")

    def _apply_serial_timeout(self) -> None:
        try:
            ser = self._serial()
            ser.timeout = config.SERIAL_READ_TIMEOUT_S
            ser.write_timeout = max(config.SERIAL_READ_TIMEOUT_S, 1.0)
        except Exception:
            pass

    def _flush_uart_buffers(self) -> None:
        try:
            ser = self._serial()
            ser.reset_input_buffer()
            ser.reset_output_buffer()
        except Exception:
            pass

    def _reset_serial_link(self) -> None:
        if not self._reset_lock.acquire(blocking=False):
            return
        try:
            try:
                ser = self._serial()
                try:
                    ser.reset_input_buffer()
                    ser.reset_output_buffer()
                except Exception:
                    pass
                if ser.is_open:
                    ser.close()
            except Exception:
                pass
            time.sleep(0.05)
            self._f = PyFingerprint(self.port, self.baud, 0xFFFFFFFF, 0x00000000)
            self._apply_serial_timeout()
            if not self._f.verifyPassword():
                print(f"[{self.name}] verifyPassword gagal setelah reset UART", flush=True)
            else:
                print(f"[{self.name}] UART direset (link pulih)", flush=True)
            self._uart_error_streak = 0
        except Exception as exc:
            print(f"[{self.name}] reset UART gagal: {exc}", flush=True)
        finally:
            self._uart_op_started = None
            self._reset_lock.release()

    def _uart_read_image(self) -> bool:
        self._uart_op_started = time.monotonic()
        try:
            return bool(self._f.readImage())
        finally:
            self._uart_op_started = None

    def _note_uart_error(self, exc: Exception) -> None:
        self._uart_error_streak += 1
        if self._uart_error_streak >= config.UART_ERROR_FLUSH_THRESHOLD:
            self._flush_uart_buffers()
            time.sleep(0.02)
        if self._uart_error_streak % config.UART_RESYNC_EVERY == 0:
            try:
                self._f.verifyPassword()
            except Exception:
                pass
        if self._uart_error_streak >= config.UART_ERROR_RESET_THRESHOLD:
            print(
                f"[{self.name}] {self._uart_error_streak} error UART berturut, flush buffer",
                flush=True,
            )
            self._flush_uart_buffers()
            self._uart_error_streak = 0

    def _uart_watchdog_loop(self) -> None:
        while not self._watchdog_stop.wait(2.0):
            op_started = self._uart_op_started
            if op_started is None:
                continue
            if time.monotonic() - op_started < config.UART_IO_STUCK_S:
                continue
            # Jangan reset port saat thread lain (enroll/verify) memegang io_lock.
            if not self.io_lock.acquire(blocking=False):
                continue
            try:
                print(
                    f"[{self.name}] readImage macet >{config.UART_IO_STUCK_S:.0f}s, reset serial",
                    flush=True,
                )
                self._reset_serial_link()
            finally:
                self.io_lock.release()

    @contextmanager
    def _io_session(self) -> Iterator[None]:
        self.io_lock.acquire()
        try:
            yield
        finally:
            self.io_lock.release()

    def _wait_image(self, should_stop: StopFn, timeout_s: float) -> bool:
        if timeout_s > 2:
            print(f"[{self.name}] waiting for finger ({timeout_s:.0f}s)…", flush=True)
        deadline = time.monotonic() + timeout_s
        last_err = 0.0
        quick_poll = timeout_s <= 1.0
        poll_gap = 0.12 if quick_poll else 0.05
        while time.monotonic() < deadline:
            if should_stop():
                return False
            try:
                if self._uart_read_image():
                    self._uart_error_streak = 0
                    return True
                if quick_poll:
                    self._uart_error_streak = max(0, self._uart_error_streak - 1)
            except Exception as exc:
                self._note_uart_error(exc)
                now = time.monotonic()
                if now - last_err > 10:
                    print(f"[{self.name}] readImage error: {exc}", flush=True)
                    last_err = now
                time.sleep(poll_gap)
                continue
            time.sleep(poll_gap)
        return False

    def _wait_remove(self, should_stop: StopFn, timeout_s: float = 15) -> None:
        deadline = time.monotonic() + timeout_s
        while time.monotonic() < deadline:
            if should_stop():
                return
            try:
                if not self._uart_read_image():
                    return
            except Exception:
                self._flush_uart_buffers()
                return
            time.sleep(0.1)

    def search(self, should_stop: StopFn) -> int:
        with self._io_session():
            if not self._wait_image(should_stop, timeout_s=config.VERIFY_IMAGE_TIMEOUT_S):
                return -2  # no finger / paused
            try:
                self._f.convertImage(FINGERPRINT_CHARBUFFER1)
                position, _accuracy = self._f.searchTemplate()
                self._uart_error_streak = 0
                return int(position)
            except Exception as exc:
                self._note_uart_error(exc)
                self._flush_uart_buffers()
                raise

    def _next_free(self) -> int:
        for page in range(0, 4):
            used = self._f.getTemplateIndex(page)
            for index, is_used in enumerate(used):
                if not is_used:
                    return page * 32 + index
        raise FingerprintError("Kapasitas sensor penuh")

    def enroll(self, should_stop: StopFn, progress: ProgressCb) -> tuple[int, str]:
        with self._io_session():
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
            template = self._load_template_bytes_unlocked(position)
            password_hash = hashlib.sha256(bytes(template)).hexdigest()
            return position, password_hash

    def _load_template_bytes_unlocked(self, position: int) -> list[int]:
        self._f.loadTemplate(position, FINGERPRINT_CHARBUFFER1)
        return list(self._f.downloadCharacteristics(FINGERPRINT_CHARBUFFER1))

    def load_template_bytes(self, position: int) -> list[int]:
        with self._io_session():
            return self._load_template_bytes_unlocked(position)

    def store_template_bytes(self, position: int, template: list[int]) -> None:
        with self._io_session():
            self._f.uploadCharacteristics(FINGERPRINT_CHARBUFFER1, template)
            self._f.storeTemplate(position, FINGERPRINT_CHARBUFFER1)

    def delete(self, position: int) -> None:
        with self._io_session():
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
