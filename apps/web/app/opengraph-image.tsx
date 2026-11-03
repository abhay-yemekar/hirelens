import { ImageResponse } from "next/og";
import { BRAND, BRAND_COLORS } from "@/components/brand";

/**
 * Link-preview image for every page that does not set its own. The
 * tagline sits on the coral highlight the mark uses for evidence; the
 * name comes from BRAND, so the rename updates this image too.
 */

export const alt = `${BRAND.name}: ${BRAND.tagline}`;

const WORDMARK_PX = 112;
/** The renderer drops the kerning pair where the wordmark's two halves
 *  meet (d–L), which opens a visible gap; pull the coral half back by it.
 *  Measured: 6 px at 112 px. Re-measure if the name changes. */
const KERNING_GAP_PX = 6;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  const { ink, coral, cream, mist } = BRAND_COLORS;
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "0 96px",
        background: ink,
        color: cream,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
        <svg width="120" height="120" viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <circle cx="16" cy="16" r="12.5" stroke={cream} strokeWidth="2.6" />
          <line
            x1="10.5"
            y1="10.6"
            x2="21.5"
            y2="10.6"
            stroke={cream}
            strokeWidth="1.8"
            strokeLinecap="round"
            opacity="0.55"
          />
          <rect x="8.6" y="13.7" width="14.8" height="4.6" rx="1.2" fill={coral} />
          <line
            x1="10.5"
            y1="21.4"
            x2="18"
            y2="21.4"
            stroke={cream}
            strokeWidth="1.8"
            strokeLinecap="round"
            opacity="0.55"
          />
        </svg>
        <div style={{ display: "flex", fontSize: WORDMARK_PX, letterSpacing: -2.8 }}>
          <span>{BRAND.lead}</span>
          <span style={{ color: coral, marginLeft: -KERNING_GAP_PX }}>{BRAND.accent}</span>
        </div>
      </div>
      <div style={{ display: "flex", marginTop: 56 }}>
        <div
          style={{
            display: "flex",
            background: coral,
            color: ink,
            fontSize: 54,
            padding: "8px 24px",
            borderRadius: 10,
          }}
        >
          {`${BRAND.tagline}.`}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          marginTop: 36,
          fontSize: 34,
          lineHeight: 1.35,
          color: mist,
        }}
      >
        <span>Open-source resume screening.</span>
        <span>Every score quotes the resume line behind it.</span>
      </div>
    </div>,
    size,
  );
}
