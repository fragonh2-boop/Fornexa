type Props = {
  className?: string;
  compact?: boolean;
  title?: string;
};

export default function FornexaLogo({ className, compact = false, title = "4NXA FORNEXA" }: Props) {
  const viewBox = compact ? "0 0 220 128" : "0 0 300 150";
  return (
    <svg
      className={className}
      viewBox={viewBox}
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid meet"
    >
      <title>{title}</title>
      <g fill="none" stroke="#0067ad" strokeWidth="18" strokeLinecap="butt" strokeLinejoin="miter">
        <path d="M28 88 L78 24 L78 116" />
        <path d="M28 88 H114" />
      </g>
      <g fill="#0067ad" fontFamily="Arial, Helvetica, sans-serif" fontWeight="800">
        <text x="116" y="92" fontSize="52" letterSpacing="2">NXA</text>
        <text x="116" y="121" fontSize="16" letterSpacing="8">FORNEXA</text>
      </g>
    </svg>
  );
}
