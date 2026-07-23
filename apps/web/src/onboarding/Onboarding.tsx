/**
 * Interactive first-run "Build your first room" walkthrough (replaces the
 * old static 4-step coach-mark tour). Gated on `localStorage` via
 * `onboardingStorage` (shows automatically once, dismissable, reopenable any
 * time via the floating "?" button). Mount once at the app root.
 *
 * Stage logic lives in `./walkthrough` (pure, unit-tested); this component
 * only renders the current stage and wires up the side effects: switching
 * `App`'s Plan/3D tab, loading the sample document, and watching
 * `sceneStore`'s document for the furniture-added / sun-changed detection
 * events the "watching" stages wait on.
 */

import { useEffect, useRef, useState } from "react";
import { getSunLight } from "@interior/core";
import { useSceneStore } from "../store/sceneStore";
import { hasSeenOnboarding, markOnboardingSeen } from "./onboardingStorage";
import { buildSampleLivingRoomDocument } from "./sampleRoom";
import {
  CHOICE_STEP_COPY,
  FURNITURE_STEP_COPY,
  PLAN_COACH_STEP,
  SAVE_STEP_COPY,
  SUN_STEP_COPY
} from "./steps";
import {
  INITIAL_STAGE,
  isWatchingStage,
  stageWantsTab,
  walkthroughReducer,
  type WalkthroughEvent,
  type WalkthroughStage
} from "./walkthrough";

export type OnboardingTab = "plan" | "3d";

export interface OnboardingProps {
  /** The app's current Plan/3D tab (App.tsx owns this state). */
  activeTab: OnboardingTab;
  /** Requests App.tsx switch tabs — used to auto-switch to 3D/Plan as the walkthrough progresses. */
  onTabChange: (tab: OnboardingTab) => void;
}

const btnStyle: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 6,
  border: "1px solid #ccc",
  background: "#fff",
  cursor: "pointer",
  fontSize: 13
};

const primaryBtnStyle: React.CSSProperties = {
  ...btnStyle,
  background: "#1663d6",
  borderColor: "#1663d6",
  color: "#fff"
};

const linkBtnStyle: React.CSSProperties = {
  border: "none",
  background: "transparent",
  color: "#888",
  fontSize: 12,
  cursor: "pointer",
  padding: "4px 2px",
  textDecoration: "underline"
};

export function Onboarding({ activeTab, onTabChange }: OnboardingProps) {
  const [open, setOpen] = useState(() => !hasSeenOnboarding());
  const [stage, setStage] = useState<WalkthroughStage>(INITIAL_STAGE);

  const document = useSceneStore((s) => s.document);
  const loadDocument = useSceneStore((s) => s.loadDocument);
  const furnitureCount = document.furniture.length;
  const sunTime = getSunLight(document)?.time ?? null;

  const furnitureBaseline = useRef<number | null>(null);
  const sunBaseline = useRef<string | null>(null);

  function dispatch(event: WalkthroughEvent): void {
    setStage((current) => walkthroughReducer(current, event));
  }

  function reopen(): void {
    setStage(INITIAL_STAGE);
    setOpen(true);
  }

  function finishAndClose(): void {
    markOnboardingSeen();
    setOpen(false);
  }

  // Auto-switch App's Plan/3D tab as the walkthrough's current stage requires.
  useEffect(() => {
    if (!open) return;
    const wanted = stageWantsTab(stage);
    if (wanted && wanted !== activeTab) onTabChange(wanted);
    // Only re-run when the stage itself changes — not on every activeTab
    // change (the user is free to switch tabs manually mid-step without the
    // walkthrough fighting them back).
  }, [stage, open]);

  // Capture the furniture-count baseline the moment the "furniture" stage
  // starts, then watch for it to increase.
  useEffect(() => {
    if (stage === "furniture") furnitureBaseline.current = furnitureCount;
  }, [stage]);
  useEffect(() => {
    if (stage === "furniture" && furnitureBaseline.current !== null && furnitureCount > furnitureBaseline.current) {
      dispatch({ type: "FURNITURE_ADDED" });
    }
  }, [furnitureCount, stage]);

  // Same pattern for the sun time-of-day slider.
  useEffect(() => {
    if (stage === "sun") sunBaseline.current = sunTime;
  }, [stage]);
  useEffect(() => {
    if (stage === "sun" && sunBaseline.current !== null && sunTime !== sunBaseline.current) {
      dispatch({ type: "SUN_CHANGED" });
    }
  }, [sunTime, stage]);

  // Reaching "done" (via SKIP, FINISH, or any transition) persists + closes.
  useEffect(() => {
    if (stage === "done") finishAndClose();
  }, [stage]);

  return (
    <>
      <button
        onClick={reopen}
        title="Build your first room (tour)"
        aria-label="Build your first room (tour)"
        data-testid="onboarding-help-button"
        style={{
          position: "fixed",
          bottom: 12,
          left: 12,
          zIndex: 50,
          width: 32,
          height: 32,
          minWidth: 44,
          minHeight: 44,
          borderRadius: "50%",
          border: "1px solid #ccc",
          background: "#fff",
          fontFamily: "sans-serif",
          fontWeight: 700,
          fontSize: 14,
          cursor: "pointer",
          boxShadow: "0 2px 6px rgba(0,0,0,0.15)"
        }}
      >
        ?
      </button>

      {open && (
        <WalkthroughOverlay
          stage={stage}
          onChooseSample={() => {
            loadDocument(buildSampleLivingRoomDocument());
            dispatch({ type: "CHOOSE_SAMPLE" });
          }}
          onChooseDraw={() => dispatch({ type: "CHOOSE_DRAW" })}
          onNext={() => dispatch({ type: "NEXT" })}
          onFinish={() => dispatch({ type: "FINISH" })}
          onSkip={() => dispatch({ type: "SKIP" })}
        />
      )}
    </>
  );
}

interface WalkthroughOverlayProps {
  stage: WalkthroughStage;
  onChooseSample: () => void;
  onChooseDraw: () => void;
  onNext: () => void;
  onFinish: () => void;
  onSkip: () => void;
}

function WalkthroughOverlay(props: WalkthroughOverlayProps) {
  const { stage } = props;

  if (stage === "choice") return <ChoiceModal {...props} />;
  if (stage === "plan") return <PlanCoachModal {...props} />;
  if (stage === "save") return <SaveModal {...props} />;
  if (isWatchingStage(stage)) return <WatchingHint {...props} />;
  // furniture-success / sun-success: a small congratulatory nudge with a Next button.
  return <NudgeHint {...props} />;
}

function ModalShell({
  children,
  onSkip,
  testId
}: {
  children: React.ReactNode;
  onSkip: () => void;
  testId: string;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Build your first room"
      data-testid={testId}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(20,20,20,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "sans-serif",
        padding: 16,
        boxSizing: "border-box"
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onSkip();
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: 24,
          width: "min(420px, 100%)",
          boxShadow: "0 12px 32px rgba(0,0,0,0.3)"
        }}
      >
        {children}
      </div>
    </div>
  );
}

function ChoiceModal({ onChooseSample, onChooseDraw, onSkip }: WalkthroughOverlayProps) {
  return (
    <ModalShell onSkip={onSkip} testId="onboarding-choice">
      <h2 style={{ margin: "0 0 8px", fontSize: 18 }}>{CHOICE_STEP_COPY.title}</h2>
      <p style={{ margin: "0 0 20px", color: "#444", fontSize: 14, lineHeight: 1.5 }}>{CHOICE_STEP_COPY.body}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <button onClick={onChooseSample} style={primaryBtnStyle} data-testid="onboarding-choose-sample">
          {CHOICE_STEP_COPY.sampleButton}
        </button>
        <button onClick={onChooseDraw} style={btnStyle} data-testid="onboarding-choose-draw">
          {CHOICE_STEP_COPY.drawButton}
        </button>
      </div>
      <div style={{ marginTop: 12, textAlign: "center" }}>
        <button onClick={onSkip} style={linkBtnStyle}>
          Skip the tour
        </button>
      </div>
    </ModalShell>
  );
}

function PlanCoachModal({ onNext, onSkip }: WalkthroughOverlayProps) {
  return (
    <ModalShell onSkip={onSkip} testId="onboarding-plan-coach">
      <span style={{ fontSize: 11, color: "#999", fontWeight: 600, textTransform: "uppercase" }}>Step 1</span>
      <h2 style={{ margin: "8px 0 8px", fontSize: 18 }}>{PLAN_COACH_STEP.title}</h2>
      <p style={{ margin: 0, color: "#444", fontSize: 14, lineHeight: 1.5 }}>{PLAN_COACH_STEP.body}</p>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20 }}>
        <button onClick={onSkip} style={btnStyle}>
          Skip
        </button>
        <button onClick={onNext} style={primaryBtnStyle} data-testid="onboarding-plan-next">
          Got it, next
        </button>
      </div>
    </ModalShell>
  );
}

function SaveModal({ onFinish, onSkip }: WalkthroughOverlayProps) {
  return (
    <ModalShell onSkip={onSkip} testId="onboarding-save">
      <span style={{ fontSize: 11, color: "#999", fontWeight: 600, textTransform: "uppercase" }}>Step 4</span>
      <h2 style={{ margin: "8px 0 8px", fontSize: 18 }}>{SAVE_STEP_COPY.title}</h2>
      <p style={{ margin: 0, color: "#444", fontSize: 14, lineHeight: 1.5 }}>{SAVE_STEP_COPY.body}</p>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
        <button onClick={onFinish} style={primaryBtnStyle} data-testid="onboarding-finish">
          Done
        </button>
      </div>
    </ModalShell>
  );
}

/** Small non-blocking corner card for detection-driven stages (furniture,
 *  sun) — deliberately NOT a full-screen modal so the user can still
 *  actually drag furniture in / drag the slider while it's showing. */
function WatchingHint({ stage, onSkip }: WalkthroughOverlayProps) {
  const copy = stage === "furniture" ? FURNITURE_STEP_COPY : SUN_STEP_COPY;
  const stepNumber = stage === "furniture" ? 2 : 3;
  const corner: React.CSSProperties = stage === "furniture" ? { left: 12, top: 64 } : { right: 12, bottom: 220 };

  return (
    <div
      data-testid={`onboarding-watching-${stage}`}
      style={{
        position: "fixed",
        zIndex: 60,
        ...corner,
        width: 260,
        background: "#fff",
        borderRadius: 10,
        padding: 14,
        boxShadow: "0 8px 24px rgba(0,0,0,0.22)",
        fontFamily: "sans-serif",
        pointerEvents: "auto"
      }}
    >
      <span style={{ fontSize: 11, color: "#999", fontWeight: 600, textTransform: "uppercase" }}>Step {stepNumber}</span>
      <h3 style={{ margin: "6px 0 6px", fontSize: 14 }}>{copy.title}</h3>
      <p style={{ margin: 0, color: "#444", fontSize: 12.5, lineHeight: 1.5 }}>{copy.body}</p>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, fontSize: 11, color: "#1663d6" }}>
        <span aria-hidden style={{ width: 6, height: 6, borderRadius: "50%", background: "#1663d6", display: "inline-block" }} />
        Waiting for you…
      </div>
      <div style={{ marginTop: 8 }}>
        <button onClick={onSkip} style={linkBtnStyle}>
          Skip the tour
        </button>
      </div>
    </div>
  );
}

/** Congratulatory nudge shown right after a "watching" stage detects success. */
function NudgeHint({ stage, onNext, onSkip }: WalkthroughOverlayProps) {
  const copy = stage === "furniture-success" ? FURNITURE_STEP_COPY : SUN_STEP_COPY;
  const corner: React.CSSProperties = stage === "furniture-success" ? { left: 12, top: 64 } : { right: 12, bottom: 220 };

  return (
    <div
      data-testid={`onboarding-nudge-${stage}`}
      style={{
        position: "fixed",
        zIndex: 60,
        ...corner,
        width: 260,
        background: "#eef6ec",
        border: "1px solid #bfe3b8",
        borderRadius: 10,
        padding: 14,
        boxShadow: "0 8px 24px rgba(0,0,0,0.22)",
        fontFamily: "sans-serif"
      }}
    >
      <h3 style={{ margin: "0 0 6px", fontSize: 14 }}>{copy.successTitle}</h3>
      <p style={{ margin: 0, color: "#444", fontSize: 12.5, lineHeight: 1.5 }}>{copy.successBody}</p>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
        <button onClick={onSkip} style={linkBtnStyle}>
          Skip
        </button>
        <button onClick={onNext} style={primaryBtnStyle} data-testid={`onboarding-nudge-next-${stage}`}>
          Next
        </button>
      </div>
    </div>
  );
}
