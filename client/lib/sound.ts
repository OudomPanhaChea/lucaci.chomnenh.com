"use client";

// Scan feedback sounds. One shared element per sound: rewinding on each play
// cuts a still-playing instance instead of overlapping when scans come fast.
// The error buzz reuses the same mp3 slowed down (lower pitch), so no second
// audio file is needed.
let beep: HTMLAudioElement | null = null;
let buzz: HTMLAudioElement | null = null;

function make(rate: number) {
  const audio = new Audio("/audios/barcode-beep.mp3");
  audio.preload = "auto";
  audio.playbackRate = rate;
  audio.preservesPitch = false;
  return audio;
}

export function preloadScanSounds() {
  if (typeof window === "undefined") return;
  beep ??= make(1);
  buzz ??= make(0.45);
}

function play(audio: HTMLAudioElement | null) {
  if (!audio) return;
  audio.currentTime = 0;
  // Play failures (autoplay policy, missing file) must never block scanning
  void audio.play().catch(() => {});
}

/** Barcode read / product added. */
export function playScanBeep() {
  preloadScanSounds();
  play(beep);
}

/** Barcode read but no matching product. */
export function playScanError() {
  preloadScanSounds();
  play(buzz);
}
