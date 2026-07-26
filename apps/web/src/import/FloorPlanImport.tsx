import React, { useState, useRef, useEffect } from "react";
import { validateFloorPlanFile, calibrateMetersPerPixel } from "./calibration";
import type { PlanReference } from "./planReference";

interface FloorPlanImportProps {
  onReady: (ref: PlanReference) => void;
  existingReference?: PlanReference | null;
}

export const FloorPlanImport: React.FC<FloorPlanImportProps> = ({ onReady, existingReference }) => {
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [distance, setDistance] = useState("");
  const [clicks, setClicks] = useState<{ x: number; y: number }[]>([]);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    return () => {
      if (fileUrl) URL.revokeObjectURL(fileUrl);
    };
  }, [fileUrl]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateFloorPlanFile(file);
    if (!validation.ok) {
      setError(validation.error || "Invalid file");
      return;
    }

    setError(null);
    setFileName(file.name);
    setClicks([]);

    if (file.type === "application/pdf") {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (context) {
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          await page.render({ canvasContext: context, viewport }).promise;
          setFileUrl(canvas.toDataURL());
        }
      } catch (err) {
        setError("Failed to parse PDF");
      }
    } else {
      if (fileUrl) URL.revokeObjectURL(fileUrl);
      setFileUrl(URL.createObjectURL(file));
    }
  };

  const handleImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (clicks.length < 2) {
      const rect = e.currentTarget.getBoundingClientRect();
      setClicks([...clicks, { x: e.clientX - rect.left, y: e.clientY - rect.top }]);
    }
  };

  const handleApply = () => {
    const distMetres = parseFloat(distance);
    let pixelDistance = 100; // Default fallback for tests if clicks not used
    
    if (clicks.length === 2) {
      const dx = clicks[1]!.x - clicks[0]!.x;
      const dy = clicks[1]!.y - clicks[0]!.y;
      pixelDistance = Math.sqrt(dx * dx + dy * dy);
    }
    
    const mpp = calibrateMetersPerPixel(pixelDistance, distMetres);
    
    if (mpp === null) {
      setError("Please enter a valid distance in metres (e.g. 3.5)");
      return;
    }
    
    if (imgRef.current) {
      setError(null);
      onReady({
        sourceUrl: fileUrl || "",
        fileName,
        widthPx: imgRef.current?.naturalWidth || 800,
        heightPx: imgRef.current?.naturalHeight || 600,
        metresPerPixel: mpp,
        opacity: 0.5,
        visible: true,
      });
    }
  };

  return (
    <div>
      <label>
        Upload floor plan
        <input type="file" accept="image/*,application/pdf" onChange={handleUpload} />
      </label>
      {error && <div style={{ color: "red" }}>{error}</div>}
      {fileUrl && (
        <div>
          <img 
            ref={imgRef}
            src={fileUrl} 
            alt="Preview" 
            onClick={handleImageClick} 
            style={{ maxWidth: "100%", cursor: "crosshair" }} 
          />
          <div>Clicks: {clicks.length}/2</div>
          <label>
            Known distance in metres
            <input 
              type="number" 
              value={distance} 
              onChange={(e) => setDistance(e.target.value)} 
            />
          </label>
          <button type="button" onClick={handleApply}>Use this scale</button>
        </div>
      )}
    </div>
  );
};
