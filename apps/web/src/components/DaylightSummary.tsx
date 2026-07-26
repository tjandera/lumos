import { sunDirection } from "@interior/core";

export function DaylightSummary({ sun, onSetTime }: { sun: any, onSetTime: (time: string) => void }) {
  const { elevation, azimuth } = sunDirection(sun);
  const isUp = elevation >= 0;
  
  // Cardinal direction from azimuth + north offset
  const compass = azimuth + sun.northOffset;
  let dir = "";
  const deg = ((compass * 180 / Math.PI) % 360 + 360) % 360;
  
  if (deg < 45 || deg >= 315) dir = "south";
  else if (deg >= 45 && deg < 135) dir = "west";
  else if (deg >= 135 && deg < 225) dir = "north";
  else if (deg >= 225 && deg < 315) dir = "east";

  return (
    <div style={{ marginBottom: 16, padding: 12, background: "#f8f9fa", borderRadius: 8, border: "1px solid #e2e8f0" }}>
      <div style={{ marginBottom: 10, fontSize: 13, fontWeight: 500, color: "#334155" }}>
        {isUp ? `Light from the ${dir}` : "Sun is below horizon"}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={() => onSetTime("09:00")} style={{ flex: 1, padding: "6px 8px", fontSize: 12, background: "#fff", border: "1px solid #cbd5e1", borderRadius: 4, cursor: "pointer" }}>Morning</button>
        <button onClick={() => onSetTime("15:00")} style={{ flex: 1, padding: "6px 8px", fontSize: 12, background: "#fff", border: "1px solid #cbd5e1", borderRadius: 4, cursor: "pointer" }}>Afternoon</button>
        <button onClick={() => onSetTime("19:00")} style={{ flex: 1, padding: "6px 8px", fontSize: 12, background: "#fff", border: "1px solid #cbd5e1", borderRadius: 4, cursor: "pointer" }}>Evening</button>
      </div>
    </div>
  );
}
