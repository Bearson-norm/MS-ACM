from __future__ import annotations

import threading
import time
import uuid

from hardware.as608 import FingerprintSensor
from hardware.relay import Relay
from sync.state import SharedState


class VerifyThread(threading.Thread):
    def __init__(self, sensor_name: str, sensor: FingerprintSensor, relay: Relay, state: SharedState) -> None:
        super().__init__(name=f"verify-{sensor_name}", daemon=True)
        self.sensor_name = sensor_name
        self.sensor = sensor
        self.relay = relay
        self.state = state

    def run(self) -> None:
        while not self.state.shutdown.is_set():
            if self.state.paused():
                # pause_event is SET while enroll/delete runs; Event.wait() would
                # return immediately and busy-spin. Sleep until standby.
                time.sleep(0.2)
                continue
            try:
                position = self.sensor.search(self.state.paused)
            except Exception as exc:
                print(f"[{self.name}] search error: {exc}", flush=True)
                continue
            if position == -2:
                continue
            self._handle_match(position)

    def _handle_match(self, fingerprint_id: int) -> None:
        request_id = str(uuid.uuid4())
        waiter = self.state.register_decision(request_id)
        self.state.send(
            {
                "type": "verify_request",
                "request_id": request_id,
                "payload": {
                    "sensor": self.sensor_name,
                    "fingerprint_id": fingerprint_id,
                    "timestamp": time.time(),
                },
            }
        )
        waiter.wait(timeout=2.0)
        decision = self.state.take_decision(request_id) or {}
        if decision.get("status") == "granted":
            self.relay.pulse(self.state.get_relay_duration())
