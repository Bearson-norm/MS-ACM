from __future__ import annotations

import os
import signal
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import config
from hardware.as608 import create_sensor
from hardware.relay import Relay
from pidfile import acquire_pid
from sync.state import SharedState
from threads.verify_thread import VerifyThread
from threads.worker import WorkerThread
from threads.ws_thread import WsThread


def main() -> None:
    try:
        sys.stdout.reconfigure(line_buffering=True)
        sys.stderr.reconfigure(line_buffering=True)
    except Exception:
        pass
    acquire_pid(config.PID_FILE)
    if config.SIMULATE:
        os.environ.setdefault("GPIOZERO_PIN_FACTORY", "mock")

    state = SharedState(config.RELAY_DURATION_MS)
    try:
        sensor = create_sensor(
            "access",
            config.SENSOR_PORT,
            config.SENSOR_BAUD,
            config.SIMULATE,
            state.simulate_triggers["access"],
        )
    except Exception as exc:
        print(f"Gagal membuka sensor: {exc}", file=sys.stderr)
        print("Set SIMULATE=1 di config.env untuk mode tanpa hardware.", file=sys.stderr)
        sys.exit(1)
    relay = Relay(config.RELAY_PIN, config.RELAY_ACTIVE_HIGH, state.relay_lock, simulate=config.SIMULATE)

    threads = [
        WsThread(state),
        WorkerThread(sensor, state),
        VerifyThread("access", sensor, relay, state),
    ]

    def stop(*_args) -> None:
        state.shutdown.set()
        state.pause_event.set()

    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)

    for thread in threads:
        thread.start()
    print("Hardware-control running (threads: ws, worker, verify-access)", flush=True)
    if config.SIMULATE:
        print("SIMULATE=1 — sensor/relay virtual. Kirim simulate_scan dari System_process untuk uji verify.")

    try:
        while not state.shutdown.is_set():
            time.sleep(0.3)
    finally:
        state.shutdown.set()
        relay.close()
        print("Hardware-control stopped")


if __name__ == "__main__":
    main()
