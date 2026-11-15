type Props = {
  values: number[];
  width?: number;
  height?: number;
  label?: string;
};

export default function Sparkline({ values, width = 64, height = 28, label }: Props) {
  if (values.length < 2) return <span style={{ width, height }} className="inline-block" aria-hidden />;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 2;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = pad + (1 - (v - min) / span) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const first = values[0];
  const last = values[values.length - 1];
  const color = last > first ? "var(--up)" : last < first ? "var(--down)" : "var(--muted)";

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className="shrink-0"
    >
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
