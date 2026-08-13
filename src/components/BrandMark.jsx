// Solaria logo mark — SVG recreation of the round brand badge (magenta circle,
// tilted white "OK" figure above the SOLARIA wordmark). Used in the sidebar and
// the sync gate. Swap for the real asset (e.g. /src/assets/solaria-logo.png) if
// a production file becomes available.
export default function BrandMark({ size = 28 }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Solaria logo">
      <circle cx="32" cy="32" r="32" fill="var(--brand)" />
      <text x="33" y="27" transform="rotate(-18 33 27)" textAnchor="middle" dominantBaseline="central"
        fontFamily="var(--font)" fontWeight="800" fontStyle="italic" fontSize="27" fill="#fff">OK</text>
      <text x="32" y="47" textAnchor="middle" fontFamily="var(--font)" fontWeight="800" fontSize="10.5"
        letterSpacing="0.5" fill="#fff">SOLARIA</text>
    </svg>
  );
}
