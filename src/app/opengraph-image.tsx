import { ImageResponse } from "next/og";

export const alt = "RepoSec — Before you ship, know what your AI forgot.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 78px",
          color: "#202522",
          background: "#f6f4ee",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 30, fontWeight: 700 }}>
          <div style={{ width: 46, height: 46, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #aac4b8", borderRadius: 12, color: "#235f4b", background: "#e2eee8" }}>R</div>
          RepoSec
        </div>
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 900 }}>
          <div style={{ color: "#235f4b", fontSize: 19, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase" }}>Launch-readiness checks</div>
          <div style={{ marginTop: 22, fontFamily: "Georgia, serif", fontSize: 76, lineHeight: 1.03, letterSpacing: -3 }}>Before you ship, know what your AI forgot.</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", color: "#626b65", fontSize: 20 }}>
          <span>Evidence · Fix prompts · Rescan</span><span>reposec.site</span>
        </div>
      </div>
    ),
    size,
  );
}
