from __future__ import annotations

import queue
import threading
import time

from hardware.as608 import FingerprintError, FingerprintSensor
from sync.state import STANDBY, SharedState


class WorkerThread(threading.Thread):
    def __init__(self, sensor: FingerprintSensor, state: SharedState) -> None:
        super().__init__(name="worker", daemon=True)
        self.sensor = sensor
        self.state = state

    def run(self) -> None:
        while not self.state.shutdown.is_set():
            try:
                command = self.state.command_queue.get(timeout=0.2)
            except queue.Empty:
                continue
            cmd_type = command.get("type")
            request_id = command.get("request_id")
            print(f"[worker] {cmd_type} request_id={request_id}", flush=True)
            # pause_event is already set; wait so verify threads finish an
            # in-flight UART call before we touch the same sensor.
            time.sleep(0.4)
            try:
                if cmd_type == "enroll_start":
                    self._enroll(request_id)
                elif cmd_type == "delete_user":
                    self._delete_user(request_id, command.get("payload") or {})
            except Exception as exc:
                self.state.send(
                    {
                        "type": "enroll_result" if cmd_type == "enroll_start" else "delete_result",
                        "request_id": request_id,
                        "payload": {"ok": False, "error": str(exc)},
                    }
                )
            finally:
                self.state.enter_mode(STANDBY)

    def _enroll(self, request_id: str) -> None:
        def progress(step: str) -> None:
            print(f"[worker] enroll {step} (sensor access)", flush=True)
            self.state.send(
                {
                    "type": "enroll_progress",
                    "request_id": request_id,
                    "payload": {"step": step},
                }
            )

        try:
            # Pause is for verify threads only. Enroll must keep reading the
            # Sensor must keep reading while pause_event is set for verification.
            fingerprint_id, password_hash = self.sensor.enroll(self.state.shutting_down, progress)
            self.state.send(
                {
                    "type": "enroll_result",
                    "request_id": request_id,
                    "payload": {
                        "ok": True,
                        "fingerprint_id": fingerprint_id,
                        "password_hash": password_hash,
                    },
                }
            )
        except FingerprintError as exc:
            self.state.send(
                {
                    "type": "enroll_result",
                    "request_id": request_id,
                    "payload": {"ok": False, "error": str(exc)},
                }
            )

    def _delete_user(self, request_id: str, payload: dict) -> None:
        fingerprint_id = int(payload.get("fingerprint_id", -1))
        if fingerprint_id < 0:
            raise FingerprintError("fingerprint_id tidak valid")
        try:
            self.sensor.delete(fingerprint_id)
        except Exception as exc:
            self.state.send(
                {
                    "type": "delete_result",
                    "request_id": request_id,
                    "payload": {"ok": False, "error": f"{self.sensor.name}: {exc}"},
                }
            )
            return
        self.state.send(
            {
                "type": "delete_result",
                "request_id": request_id,
                "payload": {"ok": True, "fingerprint_id": fingerprint_id},
            }
        )
