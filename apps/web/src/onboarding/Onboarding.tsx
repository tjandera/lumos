/**
 * Self-contained first-run onboarding: an overlay tour (localStorage-gated —
 * shows automatically once, dismissable, and re-openable at any time via the
 * floating "?" button). Mount once at the app root; owns all its own state.
 */

import { useState } from "react";
import { hasSeenOnboarding, markOnboardingSeen } from "./onboardingStorage";
import { ONBOARDING_STEPS } from "./steps";

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

export function Onboarding() {
  const [open, setOpen] = useState(() => !hasSeenOnboarding());
  const [step, setStep] = useState(0);

  function close() {
    markOnboardingSeen();
    setOpen(false);
  }

  function reopen() {
    setStep(0);
    setOpen(true);
  }

  const last = step === ONBOARDING_STEPS.length - 1;
  const current = ONBOARDING_STEPS[step]!;

  return (
    <>
      <button
        onClick={reopen}
        title="Show the tour again"
        aria-label="Show the tour again"
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
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Onboarding tour"
          data-testid="onboarding-overlay"
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
            if (e.target === e.currentTarget) close();
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: "#999", fontWeight: 600, textTransform: "uppercase" }}>
                Step {step + 1} of {ONBOARDING_STEPS.length}
              </span>
              <button
                onClick={close}
                aria-label="Dismiss tour"
                title="Dismiss"
                style={{
                  border: "none",
                  background: "transparent",
                  fontSize: 18,
                  lineHeight: 1,
                  cursor: "pointer",
                  color: "#888",
                  minWidth: 44,
                  minHeight: 44
                }}
              >
                ×
              </button>
            </div>

            <h2 style={{ margin: "8px 0 8px", fontSize: 18 }}>{current.title}</h2>
            <p style={{ margin: 0, color: "#444", fontSize: 14, lineHeight: 1.5 }}>{current.body}</p>

            <div style={{ display: "flex", gap: 6, marginTop: 20, justifyContent: "space-between" }}>
              <button onClick={close} style={btnStyle}>
                Skip
              </button>
              <div style={{ display: "flex", gap: 6 }}>
                {step > 0 && (
                  <button onClick={() => setStep((s) => Math.max(0, s - 1))} style={btnStyle}>
                    Back
                  </button>
                )}
                <button
                  onClick={() => (last ? close() : setStep((s) => Math.min(ONBOARDING_STEPS.length - 1, s + 1)))}
                  style={primaryBtnStyle}
                >
                  {last ? "Done" : "Next"}
                </button>
              </div>
            </div>

            <div style={{ display: "flex", gap: 4, justifyContent: "center", marginTop: 16 }}>
              {ONBOARDING_STEPS.map((s, i) => (
                <span
                  key={s.title}
                  aria-hidden
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: i === step ? "#1663d6" : "#ddd"
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
