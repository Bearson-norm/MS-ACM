from __future__ import annotations

import threading
import time
import uuid

import config
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
                time.sleep(config.VERIFY_POLL_INTERVAL_S)
                continue
            self._handle_match(position)

    def _handle_match(self, fingerprint_id: int) -> None:
        print(
            f"[{self.sensor_name}] finger scan ok fingerprint_id={fingerprint_id}",
            flush=True,
        )
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
        if not decision:
            print(
                f"[{self.sensor_name}] verify timeout (no decision) fingerprint_id={fingerprint_id}",
                flush=True,
            )
            self._post_scan_cooldown(config.POST_SCAN_AFTER_RELAY_S)
            return
        status = decision.get("status", "denied")
        username = decision.get("username") or "-"
        print(
            f"[{self.sensor_name}] verify {status} fingerprint_id={fingerprint_id} user={username}",
            flush=True,
        )
        duration_ms = self.state.get_relay_duration()
        if status == "granted":
            self.relay.pulse(duration_ms)
            print(f"[{self.sensor_name}] relay pulse {duration_ms}ms", flush=True)
            cooldown_s = (duration_ms / 1000.0) + config.POST_SCAN_AFTER_RELAY_S
        else:
            cooldown_s = config.POST_SCAN_AFTER_RELAY_S
        self._post_scan_cooldown(cooldown_s)

    def _post_scan_cooldown(self, cooldown_s: float) -> None:
        self.sensor.after_verify_cycle(cooldown_s)
        time.sleep(cooldown_s)
