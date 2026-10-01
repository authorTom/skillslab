import { useEffect, useRef, useState } from "react";
import { ContentPackage, errorMessage, isCancelled, type CopyProgress } from "@/data/contentPackage";
import { checkContent, type ContentProblem } from "@/data/fileInstall";
import Button from "./Button";
import ProgressBar from "./ProgressBar";
import { GroupedBody, Notice } from "./Grouped";
import { AlertIcon, CheckCircleIcon, ShieldIcon } from "./icons";

type CheckState =
  | { step: "idle" }
  | { step: "checking"; progress: CopyProgress | null }
  | { step: "done"; checked: number; problems: ContentProblem[] }
  | { step: "error"; message: string };

const PROBLEM_LABEL: Record<ContentProblem["problem"], string> = {
  missing: "missing",
  size: "incomplete",
  damaged: "damaged",
};

const SHOWN = 6;

/** Settings › Content package: read every installed media file and check
 *  it against the release, so a damaged or missing video is found before a
 *  class, not during one. */
export default function ContentCheck({ onRepair }: { onRepair: () => void }) {
  const [state, setState] = useState<CheckState>({ step: "idle" });
  const checking = useRef(false);

  useEffect(
    () => () => {
      if (checking.current) void ContentPackage.cancel();
    },
    []
  );

  async function run() {
    checking.current = true;
    setState({ step: "checking", progress: null });
    try {
      const result = await checkContent((progress) =>
        setState((s) => (s.step === "checking" ? { ...s, progress } : s))
      );
      setState({ step: "done", ...result });
    } catch (err) {
      setState(isCancelled(err) ? { step: "idle" } : { step: "error", message: errorMessage(err, "The check couldn’t finish.") });
    } finally {
      checking.current = false;
    }
  }

  const p = state.step === "checking" ? state.progress : null;

  return (
    <GroupedBody className="border-t border-line">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="max-w-sm text-[0.9375rem] leading-relaxed text-ink-2">
          Check that every installed video, image and document is present and undamaged.
        </p>
        <Button
          variant="secondary"
          icon={<ShieldIcon className="h-4 w-4" />}
          busy={state.step === "checking"}
          onClick={run}
        >
          {state.step === "checking" ? "Checking…" : "Check content"}
        </Button>
      </div>

      {state.step === "checking" && (
        <div>
          <ProgressBar
            label={p ? `Checking file ${Math.min(p.filesDone + 1, p.filesTotal)} of ${p.filesTotal}` : "Starting…"}
            value={!p ? null : p.bytesTotal > 0 ? p.bytesDone / p.bytesTotal : p.filesTotal > 0 ? p.filesDone / p.filesTotal : null}
          />
          <Button variant="plain" className="-ml-3 mt-3" onClick={() => void ContentPackage.cancel()}>
            Cancel
          </Button>
        </div>
      )}

      {state.step === "done" && state.problems.length === 0 && (
        <div className="mt-5">
          <Notice tone="success" icon={<CheckCircleIcon className="h-5 w-5" />} title="Content is intact">
            All {state.checked} {state.checked === 1 ? "file is" : "files are"} present and undamaged.
          </Notice>
        </div>
      )}

      {state.step === "done" && state.problems.length > 0 && (
        <div className="mt-5">
          <Notice
            tone="warning"
            icon={<AlertIcon className="h-5 w-5" />}
            title={state.problems.length === 1 ? "1 file needs repairing" : `${state.problems.length} files need repairing`}
            action={
              <Button variant="secondary" onClick={onRepair}>
                Go to content updates
              </Button>
            }
          >
            <ul className="mt-1 space-y-0.5">
              {state.problems.slice(0, SHOWN).map((problem) => (
                <li key={problem.path} className="truncate">
                  {problem.label} <span className="opacity-80">({PROBLEM_LABEL[problem.problem]})</span>
                </li>
              ))}
              {state.problems.length > SHOWN && <li>and {state.problems.length - SHOWN} more</li>}
            </ul>
            <p className="mt-2">To repair them, install the same content package again from a file or USB drive.</p>
          </Notice>
        </div>
      )}

      {state.step === "error" && (
        <div className="mt-5">
          <Notice tone="warning" icon={<AlertIcon className="h-5 w-5" />} title="Couldn’t check the content">
            {state.message}
          </Notice>
        </div>
      )}
    </GroupedBody>
  );
}
