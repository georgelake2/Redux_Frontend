// components/detail/ComputeStatus.js
//
// T37 (#95): the bit of a live Run or a live Verify that looks the same in
// both sections: the spinner, the Cancel button, the screen-reader
// announcement, and the failure notice. Solvers and Verifier render their
// own action button and their own idea of a result, but everything between
// pressing the button and getting an answer is identical, so it lives here
// once.
//
// --- Why the announcement and the failure box are separate elements ------
// The live region is always mounted and never carries a role that
// announces twice. A screen reader is told about a state change because the
// text inside an existing `role="status"` region changed, which is the
// reliable way to do it: a region that appears at the same moment as its
// text is frequently missed entirely.
//
// The failure box below it is deliberately NOT a live region and has no
// `role="alert"`. It is the same information at more length, and marking
// both would announce every failure twice. The short version in the live
// region is what gets spoken; the box is what gets read.
//
// These controls announced nothing at all before this task, because they
// were inert, so this is the first feedback either section has ever given
// a screen-reader user. A solve can run for up to the proxy's 75 second
// compute limit, which is far too long to leave someone guessing.

import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";
import { useEffect, useState } from "react";
import { COMPUTE_CANCELLED, COMPUTE_FAILED, COMPUTE_RUNNING } from "../../hooks/useComputeRequest";

/**
 * Cancel does not stop the backend. Saying otherwise would be the easiest
 * inaccuracy to ship here, so the wording is fixed in one place.
 */
export const CANCEL_EXPLANATION =
  "Stopped waiting for an answer. Redux may still be finishing the computation on its end; only its own time limit stops that.";

/** A run shorter than this shows no counter, so a quick solve does not flicker a "1 s". */
export const ELAPSED_SHOWN_FROM_SECONDS = 2;

/**
 * Whole seconds since this component mounted, ticking once a second. It is mounted only
 * while a run is in flight, so every run starts again from 0.
 *
 * The count is visible text only. It is deliberately outside the live region: announcing
 * every second would drown out the announcement a screen-reader user actually needs.
 */
function ElapsedSeconds({ id }) {
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(startedAt);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.floor((now - startedAt) / 1000);
  if (seconds < ELAPSED_SHOWN_FROM_SECONDS) return null;
  return (
    <Typography id={id} variant="body2" aria-hidden="true" sx={{ color: "text.secondary" }}>
      {seconds} s
    </Typography>
  );
}

/**
 * @param {Object} props
 * @param {string} props.idPrefix Prefixes every id this component renders
 *   (ground rule 4: no literal ids inside a reusable component).
 * @param {string} props.status One of the COMPUTE_* values from
 *   hooks/useComputeRequest.js.
 * @param {string} props.announcement One short sentence describing the
 *   current state, spoken by the live region. Empty string while idle.
 * @param {{headline: string, detail: string, expected?: string}|null}
 *   [props.failure] Set when `status` is failed.
 * @param {() => void} props.onCancel Called by the Cancel button.
 * @param {string} props.busyLabel Visible text next to the spinner, e.g.
 *   "Running Clique Brute Force Solver". From 2 seconds on, the seconds the run has
 *   taken so far follow it, so a long run (a quantum solver can take a minute) visibly
 *   has not frozen.
 */
export default function ComputeStatus({
  idPrefix,
  status,
  announcement,
  failure = null,
  onCancel,
  busyLabel,
}) {
  const isRunning = status === COMPUTE_RUNNING;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <Box
        id={`${idPrefix}-status`}
        role="status"
        aria-live="polite"
        sx={{ color: "text.secondary" }}
      >
        <Typography variant="body2" sx={{ color: "inherit" }}>
          {announcement}
        </Typography>
      </Box>

      {isRunning && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
          <CircularProgress size={18} aria-hidden="true" />
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {busyLabel}
          </Typography>
          <ElapsedSeconds id={`${idPrefix}-elapsed`} />
          <Box
            id={`${idPrefix}-cancel-button`}
            component="button"
            type="button"
            onClick={onCancel}
            sx={{
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 999,
              px: 1.5,
              py: 0.5,
              color: "text.primary",
              backgroundColor: "transparent",
              font: "inherit",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Cancel
          </Box>
        </Box>
      )}

      {status === COMPUTE_CANCELLED && (
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {CANCEL_EXPLANATION}
        </Typography>
      )}

      {status === COMPUTE_FAILED && failure && (
        <Box
          id={`${idPrefix}-failure`}
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 0.5,
            p: 1.5,
            borderRadius: 1,
            color: "error.light",
            backgroundColor: "status.errBg",
            border: "1px solid",
            borderColor: "status.err",
          }}
        >
          <Typography variant="body2" sx={{ color: "inherit", fontWeight: 700 }}>
            {failure.headline}
          </Typography>
          <Typography variant="body2" sx={{ color: "inherit" }}>
            {failure.detail}
          </Typography>
          {failure.expected && (
            <Typography variant="body2" sx={{ color: "inherit" }}>
              Redux expected: {failure.expected}
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
}
