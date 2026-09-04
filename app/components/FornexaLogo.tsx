type Props = {
  className?: string;
  compact?: boolean;
  title?: string;
};

export default function FornexaLogo({ className, compact = false, title = "4NXA FORNEXA" }: Props) {
  return (
    <svg
      className={className}
      viewBox="10 0 400 170"
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid meet"
      overflow="visible"
      data-compact={compact ? "true" : "false"}
    >
      <title>{title}</title>
      <g fill="none" stroke="#0067ad" strokeLinecap="round" strokeLinejoin="round">
        <path d="M30 108 L95 28 L95 142" strokeWidth="20" />
        <path d="M30 108 H138" strokeWidth="20" />
      </g>
      <g fill="#0067ad" fontFamily="Arial, Helvetica, sans-serif" fontWeight="800">
        <text x="155" y="116" fontSize="94" letterSpacing="8">NXA</text>
        <text x="160" y="160" fontSize="22" letterSpacing="12">FORNEXA</text>
      </g>
    </svg>
  );
}
