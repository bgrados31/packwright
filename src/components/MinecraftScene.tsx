type Props = {
  variant?: "overworld" | "nether";
  className?: string;
};

const COLUMNS = Array.from({ length: 50 }, (_, index) => index * 20);
const DIRT_ROWS = [250, 270, 290];

function Overworld() {
  return (
    <>
      <rect width="1000" height="300" style={{ fill: "var(--mc-sky-top)" }} />
      <rect y="180" width="1000" height="120" style={{ fill: "var(--mc-sky-bottom)" }} />

      <rect x="838" y="38" width="36" height="36" style={{ fill: "var(--mc-sun)" }} />
      <rect x="846" y="46" width="20" height="20" style={{ fill: "var(--mc-cloud)" }} />

      {[
        [120, 52, 90],
        [232, 68, 60],
        [520, 44, 110],
        [690, 76, 70],
      ].map(([x, y, width], index) => (
        <g key={index} style={{ fill: "var(--mc-cloud)" }}>
          <rect x={x} y={y} width={width} height="14" />
          <rect x={x + 16} y={y - 12} width={width - 40} height="12" />
          <rect x={x + 34} y={y - 22} width={width - 78} height="12" />
        </g>
      ))}

      <path
        d="M0 230 V186 H60 V166 H84 V142 H132 V166 H156 V186 H236 V206 H320 V230 Z"
        style={{ fill: "var(--mc-hill-far)" }}
      />
      <path
        d="M560 230 V196 H620 V172 H648 V150 H704 V172 H732 V196 H812 V214 H900 V230 Z"
        style={{ fill: "var(--mc-hill)" }}
      />

      {[100, 858].map((x) => (
        <g key={x}>
          <rect x={x + 24} y="192" width="14" height="38" style={{ fill: "var(--mc-trunk)" }} />
          <rect x={x} y="168" width="62" height="24" style={{ fill: "var(--mc-leaf)" }} />
          <rect x={x + 12} y="150" width="38" height="20" style={{ fill: "var(--mc-leaf)" }} />
          <rect x={x + 22} y="138" width="18" height="14" style={{ fill: "var(--mc-leaf)" }} />
        </g>
      ))}

      {COLUMNS.map((x, index) => (
        <g key={x}>
          <rect x={x} y="230" width="20" height="20" style={{ fill: index % 2 ? "var(--mc-grass)" : "var(--mc-grass-dark)" }} />
          {DIRT_ROWS.map((y, row) => (
            <rect
              key={y}
              x={x}
              y={y}
              width="20"
              height="20"
              style={{ fill: (index + row) % 3 === 0 ? "var(--mc-dirt-dark)" : "var(--mc-dirt)" }}
            />
          ))}
        </g>
      ))}

      <g transform="translate(460 196)" opacity="0.9">
        <rect width="32" height="32" style={{ fill: "var(--mc-leaf)" }} />
        <rect x="6" y="8" width="6" height="7" style={{ fill: "var(--mc-dirt-dark)" }} />
        <rect x="20" y="8" width="6" height="7" style={{ fill: "var(--mc-dirt-dark)" }} />
        <rect x="12" y="18" width="8" height="8" style={{ fill: "var(--mc-dirt-dark)" }} />
        <rect x="10" y="26" width="4" height="6" style={{ fill: "var(--mc-dirt-dark)" }} />
        <rect x="18" y="26" width="4" height="6" style={{ fill: "var(--mc-dirt-dark)" }} />
      </g>
    </>
  );
}

function Nether() {
  return (
    <>
      <rect width="1000" height="300" style={{ fill: "var(--mcn-sky-top)" }} />
      <rect y="150" width="1000" height="150" style={{ fill: "var(--mcn-sky-bottom)" }} />

      {/* cenizas flotando */}
      {[
        [90, 60], [210, 110], [330, 46], [470, 92], [560, 38],
        [640, 130], [880, 78], [940, 140], [150, 160], [410, 170],
      ].map(([x, y], index) => (
        <rect
          key={index}
          x={x}
          y={y}
          width={index % 3 === 0 ? 6 : 4}
          height={index % 3 === 0 ? 6 : 4}
          style={{ fill: "var(--mcn-glow)", opacity: index % 2 ? 0.35 : 0.18 }}
        />
      ))}

      {/* relieve escalonado */}
      <path
        d="M0 230 V188 H70 V168 H110 V146 H180 V168 H220 V190 H300 V210 H380 V230 Z"
        style={{ fill: "var(--mcn-rock-dark)" }}
      />
      <path
        d="M420 230 V200 H500 V180 H540 V160 H600 V180 H650 V204 H720 V230 Z"
        style={{ fill: "var(--mcn-rock)" }}
      />

      {/* portal nether */}
      <g transform="translate(-150 0)">
        <rect x="742" y="104" width="112" height="132" style={{ fill: "var(--mcn-portal-frame)" }} />
        <rect x="758" y="120" width="80" height="100" style={{ fill: "var(--mcn-portal)" }} />
        <rect x="774" y="136" width="48" height="68" style={{ fill: "var(--mcn-portal-deep)" }} />
        <rect x="742" y="104" width="112" height="12" style={{ fill: "var(--mcn-portal-rim)" }} />
        <rect x="742" y="224" width="112" height="12" style={{ fill: "var(--mcn-portal-rim)" }} />
        <rect x="742" y="104" width="12" height="132" style={{ fill: "var(--mcn-portal-rim)" }} />
        <rect x="842" y="104" width="12" height="132" style={{ fill: "var(--mcn-portal-rim)" }} />
        <rect x="766" y="128" width="8" height="84" style={{ fill: "var(--mcn-portal-rim)", opacity: 0.35 }} />
      </g>

      {/* suelo de netherrack, magma y glowstone */}
      {COLUMNS.map((x, index) => (
        <g key={x}>
          <rect x={x} y="230" width="20" height="20" style={{ fill: index % 2 ? "var(--mcn-rock)" : "var(--mcn-rock-dark)" }} />
          {DIRT_ROWS.map((y, row) => (
            <rect
              key={y}
              x={x}
              y={y}
              width="20"
              height="20"
              style={{ fill: (index + row) % 4 === 0 ? "var(--mcn-magma)" : (index + row) % 3 === 0 ? "var(--mcn-rock-dark)" : "var(--mcn-rock)" }}
            />
          ))}
          {index % 9 === 3 && <rect x={x + 4} y="234" width="10" height="9" style={{ fill: "var(--mcn-glow)", opacity: 0.75 }} />}
        </g>
      ))}
    </>
  );
}

export default function MinecraftScene({ variant = "overworld", className = "" }: Props) {
  return (
    <svg className={`mc-scene ${className}`} viewBox="0 0 1000 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {variant === "nether" ? <Nether /> : <Overworld />}
    </svg>
  );
}
