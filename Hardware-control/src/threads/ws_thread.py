from __future__ import annotations

import asyncio
import json
import threading
import time
from urllib.parse import urlencode, urlparse, urlunparse

import websockets

import config
from sync.state import SharedState


class WsThread(threading.Thread):
    def __init__(self, state: SharedState) -> None:
        super().__init__(name="ws", daemon=True)
        self.state = state
        self.loop: asyncio.AbstractEventLoop | None = None

    def run(self) -> None:
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)
        self.loop.run_until_complete(self._run())

    def _url(self) -> str:
        parsed = urlparse(config.SYSTEM_WS_URL)
        query = urlencode({"token": config.HARDWARE_TOKEN})
        return urlunparse(parsed._replace(query=query))

    async def _run(self) -> None:
        url = self._url()
        while not self.state.shutdown.is_set():
            try:
                async with websockets.connect(url, ping_interval=20, ping_timeout=20) as ws:
                    print("[ws] connected to System_process", flush=True)
                    sender = asyncio.create_task(self._sender(ws))
                    receiver = asyncio.create_task(self._receiver(ws))
                    heartbeat = asyncio.create_task(self._heartbeat())
                    done, pending = await asyncio.wait(
                        {sender, receiver, heartbeat},
                        return_when=asyncio.FIRST_COMPLETED,
                    )
                    for task in pending:
                        task.cancel()
                    for task in done:
                        exc = task.exception()
                        if exc:
                            print(f"[ws] task error: {exc}", flush=True)
            except Exception as exc:
                print(f"[ws] reconnecting after error: {exc}", flush=True)
                await asyncio.sleep(2)

    async def _sender(self, ws) -> None:
        assert self.loop is not None
        while not self.state.shutdown.is_set():
            msg = await self.loop.run_in_executor(None, self._get_outbound)
            if msg is None:
                continue
            await ws.send(json.dumps(msg))

    def _get_outbound(self):
        try:
            return self.state.outbound.get(timeout=0.3)
        except Exception:
            return None

    async def _heartbeat(self) -> None:
        while not self.state.shutdown.is_set():
            self.state.send({"type": "heartbeat", "payload": {"ts": time.time()}})
            await asyncio.sleep(10)

    async def _receiver(self, ws) -> None:
        async for raw in ws:
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue
            self._on_message(msg)

    def _on_message(self, msg: dict) -> None:
        msg_type = msg.get("type")
        payload = msg.get("payload") or {}
        request_id = msg.get("request_id")

        if msg_type == "config":
            duration = int(payload.get("relay_duration_ms") or 0)
            self.state.set_relay_duration(duration)
            return

        if msg_type == "verify_decision" and request_id:
            self.state.resolve_decision(request_id, payload)
            return

        if msg_type == "simulate_scan" and config.SIMULATE:
            self.state.trigger_simulate(
                "access",
                int(payload.get("fingerprint_id", -1)),
            )
            return

        if msg_type in {"enroll_start", "delete_user"}:
            print(f"[ws] {msg_type} request_id={request_id}", flush=True)
            command = {"type": msg_type, "request_id": request_id, "payload": payload}
            if not self.state.enqueue_exclusive(command):
                self.state.send(
                    {
                        "type": "busy",
                        "request_id": request_id,
                        "payload": {"ok": False, "error": "Hardware sibuk"},
                    }
                )
