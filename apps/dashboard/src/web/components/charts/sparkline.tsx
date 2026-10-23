/**
 * 24-point trend in the de-emphasis ink; the latest point carries the quantity hue with a
 * surface ring. Decorative next to the written value, so hidden from screen readers.
 */
export function Sparkline({
  values,
  color,
  width = 96,
  height = 28,
}: {
  values: (number | null)[];
  color: string;
  width?: number;
  height?: number;
}) {
  const present = values.flatMap((value, index) => (value === null ? [] : [{ value, index }]));
  if (present.length < 2) {
    return <svg aria-hidden width={width} height={height} />;
  }
  const min = Math.min(...present.map((p) => p.value));
  const max = Math.max(...present.map((p) => p.value));
  const range = max - min || 1;
  const pad = 4;
  const x = (index: number) => pad + (index / (values.length - 1)) * (width - pad * 2);
  const y = (value: number) => height - pad - ((value - min) / range) * (height - pad * 2);

  // Gaps (no data) break the line instead of being interpolated.
  let path = '';
  let drawing = false;
  values.forEach((value, index) => {
    if (value === null) {
      drawing = false;
      return;
    }
    path += `${drawing ? 'L' : 'M'}${x(index).toFixed(1)} ${y(value).toFixed(1)}`;
    drawing = true;
  });
  const last = present.at(-1);

  return (
    <svg
      aria-hidden
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible"
    >
      <path
        d={path}
        fill="none"
        stroke="var(--ink-3)"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {last && (
        <circle
          cx={x(last.index)}
          cy={y(last.value)}
          r={3.5}
          fill={`var(${color})`}
          stroke="var(--panel)"
          strokeWidth={2}
        />
      )}
    </svg>
  );
}
