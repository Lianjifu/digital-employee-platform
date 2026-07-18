export interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string;
  showDot?: boolean;
  className?: string;
}

/**
 * 纯 SVG 迷你趋势线。零依赖、零动画开销。
 * - 自动归一化（max → 顶，min → 底）
 * - 默认带尾点高亮
 */
export function Sparkline({
  data,
  width = 96,
  height = 24,
  stroke = 'var(--brand)',
  fill,
  showDot = true,
  className,
}: SparklineProps) {
  if (!data || data.length === 0) {
    return <div className="text-[10px] text-[var(--text-muted)]">no data</div>;
  }
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const stepX = data.length > 1 ? width / (data.length - 1) : width;
  const points = data.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * height;
    return [x, y] as const;
  });
  const pathD = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const areaD = `${pathD} L${width},${height} L0,${height} Z`;
  const last = points[points.length - 1];

  return (
    <svg width={width} height={height} className={className} viewBox={`0 0 ${width} ${height}`}>
      {fill && (
        <path
          d={areaD}
          fill={fill}
          stroke="none"
          opacity={0.4}
        />
      )}
      <path
        d={pathD}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {showDot && (
        <circle
          cx={last[0]}
          cy={last[1]}
          r={2}
          fill={stroke}
        />
      )}
    </svg>
  );
}