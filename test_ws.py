import asyncio
import json
import websockets

async def test():
    uri = "ws://127.0.0.1:8000/ws/run"
    print(f"Connecting to {uri}...")
    async with websockets.connect(uri) as ws:
        await ws.send(json.dumps({"user_prompt": "create a simple counter app using html, css, js"}))
        print("Sent prompt! Listening for messages...")
        while True:
            try:
                msg = await asyncio.wait_for(ws.recv(), timeout=60.0)
                data = json.loads(msg)
                print("RECV:", data.get("type"), data.get("node") or data.get("code") or "")
                if data.get("type") in ("done", "error"):
                    print("Finished:", data)
                    break
            except asyncio.TimeoutError:
                print("Timeout waiting for message")
                break

asyncio.run(test())
