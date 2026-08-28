"""Publish a DroidCam MJPEG stream to the SolarGuard WebSocket relay."""

from __future__ import annotations

import argparse
import asyncio

import cv2
from websockets.asyncio.client import connect


def read_frame(camera_url: str) -> bytes:
    camera = cv2.VideoCapture(camera_url)
    if not camera.isOpened():
        raise RuntimeError(f"Unable to open DroidCam stream: {camera_url}")
    try:
        ok, frame = camera.read()
        if not ok:
            raise RuntimeError("DroidCam returned no frame")
        ok, encoded = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
        if not ok:
            raise RuntimeError("Unable to encode DroidCam frame")
        return encoded.tobytes()
    finally:
        camera.release()


async def publish(camera_url: str, relay_url: str, interval: float) -> None:
    async with connect(relay_url, max_size=2_000_000) as socket:
        while True:
            frame = await asyncio.to_thread(read_frame, camera_url)
            await socket.send(frame)
            await asyncio.sleep(interval)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--camera-url', required=True, help='DroidCam URL, e.g. http://PHONE_IP:4747/video')
    parser.add_argument('--relay-url', required=True, help='Relay URL, e.g. ws://SERVER_IP:8000/camera/publish/TOKEN')
    parser.add_argument('--fps', type=float, default=2.0)
    args = parser.parse_args()
    if args.fps <= 0:
        raise SystemExit('--fps must be greater than zero')
    asyncio.run(publish(args.camera_url, args.relay_url, 1 / args.fps))


if __name__ == '__main__':
    main()
