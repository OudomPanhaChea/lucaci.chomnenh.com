"use client";
import { useEffect, useRef, useState } from "react";
import { Modal } from "antd";
import { useZxing, type BarcodeFormat } from "react-zxing";
import { CameraOff } from "lucide-react";
import { playScanBeep, preloadScanSounds } from "@/lib/sound";

// Retail 1D formats plus QR. Fewer formats means less work per frame.
const FORMATS: BarcodeFormat[] = [
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_128",
  "code_39",
  "qr_code",
];

// Owns the video element AND the camera lifecycle. Mounted only while the
// modal is open (destroyOnHidden), so unmount releases the camera.
function CameraRegion({
  onScan,
  onClose,
  continuous,
}: {
  onScan: (code: string) => void;
  onClose: () => void;
  continuous: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [permHint, setPermHint] = useState(false);
  const lastScan = useRef<{ code: string; at: number }>({ code: "", at: 0 });

  useEffect(() => {
    preloadScanSounds(); // start fetching the mp3 so the first scan beeps without delay
    // Permission persistence is decided by the browser, not the page. If it
    // will prompt, tell the user how to make the grant stick.
    navigator.permissions
      ?.query({ name: "camera" as PermissionName })
      .then((status) => setPermHint(status.state === "prompt"))
      .catch(() => {}); // Permissions API or "camera" name unsupported: skip the hint
  }, []);

  const { ref } = useZxing({
    formats: FORMATS,
    // Decoder WASM is served from public/ (postinstall copies it from
    // zxing-wasm) so scanning works without internet; the default fetches
    // it from a CDN on first open.
    wasmUrl: "/zxing_reader.wasm",
    timeBetweenDecodingAttempts: 80, // library default 300ms feels sluggish
    trySkew: true, // retries tilted frames, helps handheld EAN scans
    constraints: {
      audio: false,
      // 720p: the default low-res stream doesn't have enough pixels across
      // the barcode lines for reliable 1D decoding
      video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
    },
    onDecodeResult(result) {
      const text = result.rawValue;
      // Debounce: the camera re-reads the same code many times per second
      const now = Date.now();
      if (text === lastScan.current.code && now - lastScan.current.at < 2000) return;
      lastScan.current = { code: text, at: now };
      playScanBeep();
      onScan(text);
      if (!continuous) onClose();
    },
    onError(err) {
      const msg = String(err);
      if (/NotAllowedError|Permission/i.test(msg)) {
        setError("Camera access was denied. Allow camera access for this site and reopen the scanner.");
      } else if (/NotFoundError|NotReadableError|OverconstrainedError|no camera|not found/i.test(msg)) {
        setError("No usable camera was found on this device.");
      } else if (typeof window !== "undefined" && !window.isSecureContext) {
        setError("Camera scanning needs a secure page. Open the POS over HTTPS (or localhost).");
      } else {
        setError("Could not start the camera. Close other apps using it and try again.");
      }
    },
  });

  return (
    <>
      <div className="relative overflow-hidden rounded-lg bg-black">
        <video ref={ref} className="aspect-video w-full object-cover" muted playsInline />
        {!error && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            {/* Aiming guide only; the whole frame is decoded */}
            <div className="h-32 w-72 max-w-[85%] rounded-lg border-2 border-white/80 shadow-[0_0_0_999px_rgba(0,0,0,0.35)]" />
          </div>
        )}
      </div>
      {error ? (
        <div className="mt-3 flex items-start gap-2.5 rounded-lg bg-amber-50 p-3 text-sm text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
          <CameraOff className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{error}</p>
        </div>
      ) : (
        <p className="mt-3 text-center text-sm text-fg-muted">
          Point the camera at the product barcode.
          {permHint &&
            " When the browser asks for the camera, choose \"Allow on every visit\" (or \"Remember this decision\") so it stops asking each time."}
        </p>
      )}
    </>
  );
}

// Camera barcode scanner (phone/tablet/laptop). Supports the common retail
// 1D formats plus QR. Keyboard-wedge USB scanners don't need this modal:
// they type into the POS search box and submit with Enter.
export default function BarcodeScanner({
  open,
  onClose,
  onScan,
  continuous = false,
}: {
  open: boolean;
  onClose: () => void;
  onScan: (code: string) => void;
  continuous?: boolean; // keep scanning (POS cart mode) vs close on first hit
}) {
  return (
    <Modal open={open} onCancel={onClose} footer={null} title="Scan barcode" destroyOnHidden width={420}>
      {open && <CameraRegion onScan={onScan} onClose={onClose} continuous={continuous} />}
    </Modal>
  );
}
