const CAMERA_CAPTURE_TIMEOUT_MS = 15_000;

function getCameraViewerUrl(): string | null {
  const configuredUrl = import.meta.env.VITE_CAMERA_STREAM_URL?.trim();
  const token = import.meta.env.VITE_CAMERA_STREAM_TOKEN?.trim();
  if (!configuredUrl || !token) return null;

  const url = new URL(configuredUrl);
  if (!url.pathname.includes('/camera/view/')) {
    url.pathname = `${url.pathname.replace(/\/$/, '')}/view/${encodeURIComponent(token)}`;
  }
  return url.toString();
}

/** Receive the next JPEG frame from the phone camera WebSocket relay. */
export function captureFromWifiCamera(): Promise<Blob> {
  const viewerUrl = getCameraViewerUrl();
  if (!viewerUrl) {
    return Promise.reject(new Error('Wi-Fi camera is not configured. Set VITE_CAMERA_STREAM_URL and VITE_CAMERA_STREAM_TOKEN.'));
  }

  return new Promise((resolve, reject) => {
    const socket = new WebSocket(viewerUrl);
    let settled = false;
    const timeout = window.setTimeout(() => {
      finish(() => reject(new Error('Timed out waiting for a frame from the phone camera.')));
    }, CAMERA_CAPTURE_TIMEOUT_MS);

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      socket.close();
      callback();
    };

    socket.binaryType = 'blob';
    socket.onmessage = (event) => {
      if (event.data instanceof Blob && event.data.size > 0) {
        finish(() => resolve(event.data));
      }
    };
    socket.onerror = () => finish(() => reject(new Error('Could not connect to the phone camera Wi-Fi server.')));
    socket.onclose = () => finish(() => reject(new Error('The phone camera connection closed before a frame arrived.')));
  });
}
