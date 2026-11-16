import { ImageResponse } from "next/og";

const BLUE = "#0a66ff";

// A white "D" built from a stem and an arc, kept inside the central 80% safe zone for maskable icons.
export function renderAppIcon(size: number) {
  const u = size / 100;

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
        <div
          style={{
            position: "absolute",
            left: 32 * u,
            top: 24 * u,
            width: 12 * u,
            height: 52 * u,
            background: "#ffffff",
            borderRadius: 2 * u,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 38 * u,
            top: 24 * u,
            width: 30 * u,
            height: 52 * u,
            borderTop: `${12 * u}px solid #ffffff`,
            borderRight: `${12 * u}px solid #ffffff`,
            borderBottom: `${12 * u}px solid #ffffff`,
            borderLeft: "0 solid transparent",
            borderRadius: `0 ${26 * u}px ${26 * u}px 0`,
          }}
        />
      </div>
    ),
    { width: size, height: size },
  );
}
