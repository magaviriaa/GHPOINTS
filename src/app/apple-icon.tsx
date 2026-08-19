import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** El podio, que es la firma del producto, dibujado sin depender de una fuente. */
export default function AppleIcon() {
  const bars = [
    { color: "#8a93a6", height: 58 },
    { color: "#f2b705", height: 92 },
    { color: "#a45b2a", height: 40 },
  ];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          gap: 8,
          paddingBottom: 34,
          background: "linear-gradient(168deg, #1b2748 0%, #0b1220 100%)",
        }}
      >
        {bars.map((bar) => (
          <div
            key={bar.color}
            style={{ width: 34, height: bar.height, borderRadius: 5, background: bar.color }}
          />
        ))}
      </div>
    ),
    size
  );
}
