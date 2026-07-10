"use client";
import { useSyncExternalStore } from "react";

// SSR/hydration gate without setState-in-effect
const emptySubscribe = () => () => {};
export function useMounted() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}
