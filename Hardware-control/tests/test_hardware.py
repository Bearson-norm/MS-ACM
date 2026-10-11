from __future__ import annotations

import queue
import sys
import threading
import time
import unittest
from pathlib import Path


SRC = Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(SRC))

from hardware.as608 import SimulateSensor  # noqa: E402
from hardware.relay import Relay  # noqa: E402
from sync.state import STANDBY, SharedState  # noqa: E402
from threads.verify_thread import VerifyThread  # noqa: E402


class RecordingRelay:
    def __init__(self) -> None:
        self.pulses: list[int] = []

    def pulse(self, duration_ms: int) -> bool:
        self.pulses.append(duration_ms)
        return True


class SharedStateTests(unittest.TestCase):
    def test_only_one_exclusive_command_is_accepted(self) -> None:
        state = SharedState(3000)
        first = {"type": "enroll_start", "request_id": "one"}
        second = {"type": "delete_user", "request_id": "two"}

        self.assertTrue(state.enqueue_exclusive(first))
        self.assertFalse(state.enqueue_exclusive(second))
        self.assertTrue(state.paused())

        state.command_queue.get_nowait()
        state.enter_mode(STANDBY)
        self.assertFalse(state.paused())
        self.assertTrue(state.enqueue_exclusive(second))

    def test_simulation_has_only_access_trigger(self) -> None:
        state = SharedState(3000)
        self.assertEqual(set(state.simulate_triggers), {"access"})
        state.trigger_simulate("entry", 5)
        self.assertTrue(state.simulate_triggers["access"].empty())


class SimulateSensorTests(unittest.TestCase):
    def setUp(self) -> None:
        SimulateSensor.store = {"access": {}}
        self.triggers: queue.Queue[int] = queue.Queue()
        self.sensor = SimulateSensor("access", self.triggers)

    def test_enroll_search_and_delete(self) -> None:
        position, password_hash = self.sensor.enroll(lambda: False, lambda _step: None)
        self.assertEqual(position, 0)
        self.assertEqual(len(password_hash), 64)

        self.triggers.put(position)
        self.assertEqual(self.sensor.search(lambda: False), position)
        self.sensor.delete(position)
        self.triggers.put(position)
        self.assertEqual(self.sensor.search(lambda: False), -1)


class VerifyTests(unittest.TestCase):
    def test_only_granted_decision_pulses_relay(self) -> None:
        state = SharedState(1250)
        sensor = SimulateSensor("access", queue.Queue())
        relay = RecordingRelay()
        verify = VerifyThread("access", sensor, relay, state)

        def decide(status: str) -> threading.Thread:
            def worker() -> None:
                message = state.outbound.get(timeout=1)
                self.assertEqual(message["payload"]["sensor"], "access")
                state.resolve_decision(message["request_id"], {"status": status})

            thread = threading.Thread(target=worker)
            thread.start()
            return thread

        thread = decide("granted")
        verify._handle_match(0)
        thread.join(timeout=1)
        self.assertEqual(relay.pulses, [1250])

        thread = decide("denied")
        verify._handle_match(0)
        thread.join(timeout=1)
        self.assertEqual(relay.pulses, [1250])


class RelayTests(unittest.TestCase):
    def test_overlapping_pulse_is_rejected(self) -> None:
        relay = Relay(17, True, threading.Lock(), simulate=True)
        first_result: list[bool] = []
        first = threading.Thread(target=lambda: first_result.append(relay.pulse(80)))
        first.start()
        time.sleep(0.02)
        self.assertFalse(relay.pulse(10))
        first.join(timeout=1)
        self.assertEqual(first_result, [True])


if __name__ == "__main__":
    unittest.main()
