import { ImageResponse } from "next/og";

const BLUE = "#0a66ff";

// A white "F" built from bars, kept inside the central 80% safe zone for maskable icons.
export function renderAppIcon(size: number) {
  const u = size / 100;
  const bar = { position: "absolute" as const, background: "#ffffff", borderRadius: 2 * u };

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          background: BLUE,
        }}
      >
        <div style={{ ...bar, left: 35 * u, top: 26 * u, width: 12 * u, height: 48 * u }} />
        <div style={{ ...bar, left: 35 * u, top: 26 * u, width: 32 * u, height: 12 * u }} />
        <div style={{ ...bar, left: 35 * u, top: 45 * u, width: 25 * u, height: 11 * u }} />
      </div>
    ),
    { width: size, height: size },
  );
}
