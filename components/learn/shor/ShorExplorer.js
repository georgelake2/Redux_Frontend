// components/learn/shor/ShorExplorer.js
//
// Mockup (feature/shor-explorer-page): mounts the Shor's explorer into a React-owned box.
// The explorer draws its own DOM (explorerEngine.js); React owns only the container, the
// scoped stylesheet and the mount/unmount lifecycle.

import Box from "@mui/material/Box";
import { useEffect, useRef } from "react";
import hardwareRun from "../../../data/shor/hardwareRun.json";
import kingstonCircuit from "../../../data/shor/kingstonCircuit.json";
import { mountShorExplorer } from "./explorerEngine";
import { EXPLORER_MARKUP } from "./explorerMarkup";
import { EXPLORER_CSS } from "./explorerStyles";

export default function ShorExplorer() {
  const rootRef = useRef(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    root.innerHTML = EXPLORER_MARKUP;
    const cleanup = mountShorExplorer(root, { hardwareRun, kingstonCircuit });
    return () => {
      cleanup();
      root.innerHTML = "";
    };
  }, []);

  return (
    <>
      <style>{EXPLORER_CSS}</style>
      <Box ref={rootRef} className="shx" id="shor-explorer" />
    </>
  );
}
