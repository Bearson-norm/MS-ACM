from __future__ import annotations

import queue
import threading
from typing import Any, Optional


STANDBY = "standby"
ENROLL = "enroll"
DELETE = "delete"
EXCLUSIVE_TYPES = {"enroll_start", "delete_user"}


class SharedState:
    def __init__(self, relay_duration_ms: int) -> None:
        self.mode = STANDBY
        self.mode_lock = threading.Lock()
        self.pause_event = threading.Event()
        self.relay_lock = threading.Lock()
        self.command_queue: queue.Queue[dict[str, Any]] = queue.Queue(maxsize=1)
        self.outbound: queue.Queue[dict[str, Any]] = queue.Queue()
        self.shutdown = threading.Event()
        self.relay_duration_ms = relay_duration_ms
        self.duration_lock = threading.Lock()
        self._decisions: dict[str, dict[str, Any]] = {}
        self._decision_lock = threading.Lock()
        self.simulate_triggers: dict[str, queue.Queue[int]] = {"access": queue.Queue()}

    def send(self, message: dict[str, Any]) -> None:
        self.outbound.put(message)

    def set_relay_duration(self, duration_ms: int) -> None:
        if duration_ms <= 0:
            return
        with self.duration_lock:
            self.relay_duration_ms = duration_ms

    def get_relay_duration(self) -> int:
        with self.duration_lock:
            return self.relay_duration_ms

    def enqueue_exclusive(self, command: dict[str, Any]) -> bool:
        cmd_type = command.get("type")
        with self.mode_lock:
            if self.mode != STANDBY:
                return False
            try:
                self.command_queue.put_nowait(command)
            except queue.Full:
                return False
            self.mode = ENROLL if cmd_type == "enroll_start" else DELETE
            self.pause_event.set()
            return True

    def enter_mode(self, mode: str) -> None:
        with self.mode_lock:
            self.mode = mode
            if mode == STANDBY:
                self.pause_event.clear()
            else:
                self.pause_event.set()

    def paused(self) -> bool:
        return self.pause_event.is_set() or self.shutdown.is_set()

    def shutting_down(self) -> bool:
        return self.shutdown.is_set()

    def register_decision(self, request_id: str) -> threading.Event:
        event = threading.Event()
        with self._decision_lock:
            self._decisions[request_id] = {"event": event, "payload": None}
        return event

    def resolve_decision(self, request_id: str, payload: dict[str, Any]) -> None:
        with self._decision_lock:
            item = self._decisions.get(request_id)
            if not item:
                return
            item["payload"] = payload
            item["event"].set()

    def take_decision(self, request_id: str) -> Optional[dict[str, Any]]:
        with self._decision_lock:
            item = self._decisions.pop(request_id, None)
        if not item:
            return None
        return item.get("payload")

    def trigger_simulate(self, sensor: str, fingerprint_id: int) -> None:
        q = self.simulate_triggers.get(sensor)
        if q is None:
            return
        try:
            q.put_nowait(fingerprint_id)
        except queue.Full:
            pass
