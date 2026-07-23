import { useEffect, useState } from "react";
import { DesignsModal } from "./components/DesignsModal";
import { PlanEditor } from "./editor/PlanEditor";
import { PropertiesPanel } from "./editor/PropertiesPanel";
import { LightingPanel } from "./components/LightingPanel";
import { CatalogPanel } from "./scene3d/CatalogPanel";
import { Scene3D } from "./scene3d/Scene3D";
import { useDesignStore } from "./store/designStore";
import { ErrorBoundary } from "./telemetry/ErrorBoundary";
import { installGlobalErrorHandlers } from "./telemetry/telemetry";
import { isEnabled } from "./flags/features";
import { ChatPanel } from "./ai/ChatPanel";
import { ShareButton } from "./share/ShareButton";
import { Onboarding } from "./onboarding/Onboarding";
import { MoveInProgress } from "./components/MoveInProgress";

type Tab = "plan" | "3d";

function DesignToolbar() {
  const id = useDesignStore((s) => s.id);
  const name = useDesignStore((s) => s.name);
  const dirty = useDesignStore((s) => s.dirty);
  const saveStatus = useDesignStore((s) => s.saveStatus);
  const saveError = useDesignStore((s) => s.saveError);
  const setName = useDesignStore((s) => s.setName);
  const newDesign = useDesignStore((s) => s.newDesign);
  const save = useDesignStore((s) => s.save);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(name);
  const [showOpen, setShowOpen] = useState(false);

  useEffect(() => {
    if (!editingName) setDraftName(name);
  }, [name, editingName]);

  function commitName() {
    setEditingName(false);
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== name) setName(trimmed);
    else setDraftName(name);
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {editingName ? (
          <input
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitName();
              if (e.key === "Escape") {
                setDraftName(name);
                setEditingName(false);
              }
            }}
            style={{ font: "inherit", fontWeight: 600, padding: "2px 4px" }}
          />
        ) : (
          <strong
            onClick={() => setEditingName(true)}
            title="Click to rename"
            style={{ cursor: "text", padding: "2px 4px", borderRadius: 4 }}
          >
            {name}
          </strong>
        )}
        {dirty && (
          <span
            aria-label="Unsaved changes"
            title="Unsaved changes"
            style={{ width: 8, height: 8, borderRadius: "50%", background: "#d97706", display: "inline-block" }}
          />
        )}
        {saveStatus === "error" && saveError && (
          <span style={{ fontSize: 11, color: "#b3261e" }} title={saveError}>
            Save failed
          </span>
        )}
      </div>

      <div style={{ display: "flex", gap: 6, marginLeft: 16 }}>
        <button onClick={() => newDesign()}>New</button>
        <button onClick={() => void save()} disabled={saveStatus === "saving"}>
          {saveStatus === "saving" ? "Saving…" : "Save"}
        </button>
        <button onClick={() => setShowOpen(true)}>Open</button>
        {/* Share requires a server-assigned id, i.e. the design has been saved at least once. */}
        <ShareButton designId={id} />
      </div>

      {showOpen && <DesignsModal onClose={() => setShowOpen(false)} />}
    </>
  );
}

function OfflineBanner() {
  const apiOnline = useDesignStore((s) => s.apiOnline);
  if (apiOnline !== false) return null;
  return (
    <div
      style={{
        padding: "6px 12px",
        background: "#fff3e0",
        color: "#8a5300",
        fontSize: 12,
        fontFamily: "sans-serif",
        borderBottom: "1px solid #ffe0b2",
        textAlign: "center"
      }}
    >
      API offline — changes are local only.
    </div>
  );
}

export function App() {
  const [tab, setTab] = useState<Tab>("plan");
  const [lightingMood, setLightingMood] = useState<"natural" | "warm" | "bright">("natural");
  const checkApiHealth = useDesignStore((s) => s.checkApiHealth);

  useEffect(() => {
    void checkApiHealth();
  }, [checkApiHealth]);

  useEffect(() => {
    installGlobalErrorHandlers();
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100vw", height: "100vh" }}>
      <Onboarding />
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "8px 12px",
          borderBottom: "1px solid #ddd",
          fontFamily: "sans-serif"
        }}
      >
        <DesignToolbar />
        <nav style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
          <button data-active={tab === "plan"} onClick={() => setTab("plan")}>
            Plan
          </button>
          <button data-active={tab === "3d"} onClick={() => setTab("3d")}>
            3D
          </button>
        </nav>
      </header>

      <OfflineBanner />

      <div style={{ flex: 1, display: "flex", minHeight: 0, position: "relative" }}>
        <MoveInProgress />
        {tab === "plan" ? (
          <>
            <div style={{ flex: 1, minWidth: 0 }}>
              <PlanEditor />
            </div>
            <PropertiesPanel />
          </>
        ) : (
          <>
            <CatalogPanel />
            <div style={{ flex: 1, minWidth: 0 }}>
              <ErrorBoundary
                fallback={(reset) => (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      height: "100%",
                      gap: 8,
                      fontFamily: "sans-serif",
                      color: "#8a2020"
                    }}
                  >
                    <p>The 3D view hit an error and stopped. The plan editor is unaffected.</p>
                    <button onClick={reset}>Try again</button>
                  </div>
                )}
              >
                <Scene3D lightingMood={lightingMood} />
              </ErrorBoundary>
            </div>
            <LightingPanel lightingMood={lightingMood} onLightingMoodChange={setLightingMood} />
            {isEnabled("ai") && <ChatPanel />}
          </>
        )}
      </div>
    </div>
  );
}
