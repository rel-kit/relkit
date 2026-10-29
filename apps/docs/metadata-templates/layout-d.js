/** RELKIT's white frame, four-square mark, and editorial hierarchy. */
export function layoutD({ headline, tagline, colors, logoBase64 }) {
  const box = (style, children) => ({
    type: "div",
    props: { style: { display: "flex", ...style }, children },
  });
  const line = "1px solid #e5e5e5";
  return box(
    {
      width: "100%",
      height: "100%",
      padding: "0 40px",
      backgroundColor: colors.background,
      color: colors.foreground,
      fontFamily: "Inter",
    },
    box(
      {
        flexDirection: "column",
        width: "100%",
        height: "100%",
        borderLeft: line,
        borderRight: line,
      },
      [
        box(
          { alignItems: "center", padding: "32px 40px", gap: "16px", borderBottom: line },
          [
            logoBase64 && { type: "img", props: { src: logoBase64, width: 32, height: 32 } },
            box({ fontSize: 28, fontWeight: 700, letterSpacing: "-1px" }, headline),
            box(
              { marginLeft: "auto", fontSize: 16, color: "#737373" },
              "THE TYPESCRIPT APPLICATION KIT",
            ),
          ].filter(Boolean),
        ),
        box(
          {
            flex: 1,
            flexDirection: "column",
            justifyContent: "center",
            padding: "44px 56px",
          },
          [
            box(
              {
                maxWidth: 920,
                fontSize: 72,
                fontWeight: 400,
                lineHeight: 1.08,
                letterSpacing: "-4px",
              },
              tagline,
            ),
            box(
              { marginTop: 28, fontSize: 24, color: "#737373", lineHeight: 1.4 },
              "Build, run, inspect, and deploy. One checked graph.",
            ),
          ],
        ),
        box(
          {
            borderTop: line,
            alignItems: "center",
            justifyContent: "space-between",
            padding: "26px 40px",
            fontSize: 18,
            color: "#737373",
          },
          [
            box({}, "TypeScript / Local to cloud / Open source"),
            box({ color: colors.foreground }, "relkit.dev ↗"),
          ],
        ),
      ],
    ),
  );
}
