import React from "react";

export function MoveInProgress() {
  const steps = ["Upload plan", "Trace room", "Find furniture", "Check light"];
  return (
    <div style={{
      position: "absolute", bottom: 20, left: "50%", transform: "translateX(-50%)",
      display: "flex", gap: 16, background: "rgba(255,255,255,0.96)",
      padding: "10px 20px", borderRadius: 30, boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
      zIndex: 10, fontFamily: "sans-serif", fontSize: 13,
      pointerEvents: "none"
    }}>
      {steps.map((step, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 20, height: 20, borderRadius: "50%", background: "#e2e8f0", color: "#64748b",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 600, fontSize: 11
          }}>{i + 1}</div>
          <span style={{ fontWeight: 500, color: "#334155" }}>{step}</span>
        </div>
      ))}
    </div>
  );
}
