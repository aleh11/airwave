const BAND_MIN = 87.5;
const BAND_MAX = 108;
const VIEW_W = 1000;
const VIEW_H = 116;
const PAD = 26;
const BASELINE = 82;

export function stationFrequency(seed: string | number | null | undefined) {
  if (seed === null || seed === undefined) return (BAND_MIN + BAND_MAX) / 2;
  const text = String(seed);
  let hash = 0;
  for (let index = 0; index < text.length; index++) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  const span = Math.round((BAND_MAX - BAND_MIN) * 10);
  return BAND_MIN + (hash % (span + 1)) / 10;
}

export function formatFrequency(frequency: number) {
  return frequency.toFixed(1);
}

function freqToX(frequency: number) {
  const clamped = Math.min(BAND_MAX, Math.max(BAND_MIN, frequency));
  const ratio = (clamped - BAND_MIN) / (BAND_MAX - BAND_MIN);
  return PAD + ratio * (VIEW_W - PAD * 2);
}

export function TunerDial({ frequency, live, tuned }: {
  frequency: number;
  live: boolean;
  tuned: boolean;
}) {
  const majors: number[] = [];
  for (let value = 88; value <= 108; value += 2) majors.push(value);
  const minors: number[] = [];
  for (let value = BAND_MIN; value <= BAND_MAX + 0.01; value += 0.5) {
    if (Math.abs(value % 2) > 0.01) minors.push(Number(value.toFixed(1)));
  }
  const needleX = freqToX(frequency);

  return (
    <svg
      className="airwave-dial"
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      role="img"
      aria-label={`Tuned to ${formatFrequency(frequency)} megahertz`}
    >
      <line
        x1={PAD}
        y1={BASELINE}
        x2={VIEW_W - PAD}
        y2={BASELINE}
        stroke="var(--color-border)"
        strokeWidth={1.5}
      />
      {minors.map((value) => (
        <line
          key={`minor-${value}`}
          x1={freqToX(value)}
          y1={BASELINE}
          x2={freqToX(value)}
          y2={BASELINE - 10}
          stroke="var(--color-border)"
          strokeWidth={1}
        />
      ))}
      {majors.map((value) => (
        <g key={`major-${value}`}>
          <line
            x1={freqToX(value)}
            y1={BASELINE}
            x2={freqToX(value)}
            y2={BASELINE - 22}
            stroke="var(--color-text-secondary)"
            strokeWidth={2}
          />
          <text
            x={freqToX(value)}
            y={BASELINE + 22}
            textAnchor="middle"
            fontSize={19}
            fontFamily="var(--font-family-mono, monospace)"
            fill="var(--color-text-secondary)"
          >
            {value}
          </text>
        </g>
      ))}
      <g
        className={tuned
          ? "airwave-dial-needle"
          : "airwave-dial-needle is-idle"}
        style={{ transform: `translateX(${needleX}px)` }}
      >
        <line
          x1={0}
          y1={6}
          x2={0}
          y2={BASELINE + 4}
          stroke="var(--color-accent)"
          strokeWidth={3}
          strokeLinecap="round"
          className={live ? "airwave-dial-beam is-live" : "airwave-dial-beam"}
        />
        <circle cx={0} cy={6} r={5} fill="var(--color-accent)" />
      </g>
    </svg>
  );
}
