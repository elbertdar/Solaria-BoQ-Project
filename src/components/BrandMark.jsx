// Solaria logo mark — brand-purple ball with a white S. Used in the sidebar and
// the sync gate.
export default function BrandMark({ size = 28 }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Solaria logo">
      <circle cx="32" cy="32" r="32" fill="var(--brand)" />
      <text x="32" y="33" textAnchor="middle" dominantBaseline="central"
        fontFamily="var(--font)" fontWeight="800" fontSize="34" fill="#fff">S</text>
    </svg>
  );
}
