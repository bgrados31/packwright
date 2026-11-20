type Props = {
  code: "gb" | "es";
  className?: string;
};

/** Banderas en SVG: Windows no renderiza los emoji de bandera y muestra solo las letras. */
export default function Flag({ code, className = "" }: Props) {
  if (code === "es") {
    return (
      <svg className={`flag-icon ${className}`} viewBox="0 0 60 40" aria-hidden="true">
        <rect width="60" height="40" fill="#AA151B" />
        <rect y="10" width="60" height="20" fill="#F1BF00" />
        <rect x="15" y="15.5" width="7" height="9" rx="0.6" fill="#AA151B" stroke="#F1BF00" strokeWidth="0.7" />
        <path d="M18.5 16v8M15.5 20h6" stroke="#F1BF00" strokeWidth="0.6" opacity="0.9" />
      </svg>
    );
  }

  return (
    <svg className={`flag-icon ${className}`} viewBox="0 0 60 40" aria-hidden="true">
      <rect width="60" height="40" fill="#012169" />
      <path d="M0 0 60 40M60 0 0 40" stroke="#fff" strokeWidth="8" />
      <path d="M0 0 60 40M60 0 0 40" stroke="#C8102E" strokeWidth="3.5" />
      <path d="M30 0v40M0 20h60" stroke="#fff" strokeWidth="13" />
      <path d="M30 0v40M0 20h60" stroke="#C8102E" strokeWidth="6.5" />
    </svg>
  );
}
