import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { scaleLinear, scaleTime } from '@visx/scale';
import { LinePath, Bar } from '@visx/shape';
import { AxisBottom, AxisLeft } from '@visx/axis';
import { GridRows } from '@visx/grid';
import { Group } from '@visx/group';
import {
  ProfilerMetricType,
  SessionDetail,
  SessionTimelinePoint,
  SessionRawEventRef,
} from '../../../types';

const SERIES_COLORS: Record<string, string> = {
  total: '#2a73d9',
  output: '#6e9a2f',
  input: '#e48a0a',
  cached: '#1f2f8c',
  trend: '#e12d99',
  data: '#2a73d9',
  dataTrend: '#e48a0a',
  latency: '#e48a0a',
  latencyTrend: '#1f2f8c',
};

type MarkerShape = 'circle' | 'square' | 'diamond' | 'triangleDown' | 'triangleUp';

interface SeriesDef {
  key: string;
  label: string;
  color: string;
  marker: MarkerShape;
  lineWidth: number;
  opacity: number;
  getValue: (point: SessionTimelinePoint, index: number) => number;
}

interface ProfilerChartProps {
  detail: SessionDetail;
  metric: ProfilerMetricType;
  onOpenSource: (filePath: string, lineNumber: number) => void;
}

const CHART_HEIGHT = 252;
const AXIS_RAIL_WIDTH = 60;
const PADDING = { top: 18, right: 18, bottom: 34, left: 18 };
const PIXELS_PER_MINUTE = 14;
const MIN_WIDTH = 640;
const MIN_POINT_SPACING = 72;
const BAR_WIDTH = 8;
const TOOLTIP_MARGIN = 12;
const TOOLTIP_APPROX_WIDTH = 380;

function getTokenTotal(p: SessionTimelinePoint): number {
  return (p.inputTokens ?? 0) + (p.outputTokens ?? 0) + (p.cachedTokens ?? 0);
}

function computeMovingAverage(values: number[], windowSize: number): number[] {
  return values.map((_, i) => {
    const start = Math.max(0, i - windowSize + 1);
    const slice = values.slice(start, i + 1);
    return slice.length > 0 ? slice.reduce((a, b) => a + b, 0) / slice.length : 0;
  });
}

function buildSeriesDefs(
  metric: ProfilerMetricType,
  timeline: SessionTimelinePoint[],
): SeriesDef[] {
  if (metric === 'tokens') {
    const totals = timeline.map((p) => p.totalTokens ?? getTokenTotal(p));
    const trend = computeMovingAverage(totals, 3);
    return [
      {
        key: 'total',
        label: 'Total',
        color: SERIES_COLORS.total,
        marker: 'circle',
        lineWidth: 3.2,
        opacity: 1,
        getValue: (p) => p.totalTokens ?? getTokenTotal(p),
      },
      {
        key: 'output',
        label: 'Output',
        color: SERIES_COLORS.output,
        marker: 'square',
        lineWidth: 2.4,
        opacity: 1,
        getValue: (p) => p.outputTokens ?? 0,
      },
      {
        key: 'input',
        label: 'Input',
        color: SERIES_COLORS.input,
        marker: 'diamond',
        lineWidth: 2.4,
        opacity: 1,
        getValue: (p) => p.inputTokens ?? 0,
      },
      {
        key: 'cached',
        label: 'Cached',
        color: SERIES_COLORS.cached,
        marker: 'triangleDown',
        lineWidth: 2.4,
        opacity: 1,
        getValue: (p) => p.cachedTokens ?? 0,
      },
      {
        key: 'trend',
        label: 'Trend',
        color: SERIES_COLORS.trend,
        marker: 'triangleUp',
        lineWidth: 2.4,
        opacity: 0.95,
        getValue: (_p, i) => trend[i] ?? 0,
      },
    ];
  }

  if (metric === 'data') {
    const payloads = timeline.map((p) => p.payloadKb ?? 0);
    const trend = computeMovingAverage(payloads, 3);
    return [
      {
        key: 'payload',
        label: 'Payload KB',
        color: SERIES_COLORS.data,
        marker: 'circle',
        lineWidth: 3.2,
        opacity: 1,
        getValue: (p) => p.payloadKb ?? 0,
      },
      {
        key: 'trend',
        label: 'Payload trend',
        color: SERIES_COLORS.dataTrend,
        marker: 'diamond',
        lineWidth: 2.4,
        opacity: 0.95,
        getValue: (_p, i) => trend[i] ?? 0,
      },
    ];
  }

  const latencies = timeline.map((p) => p.latencyMs ?? 0);
  const trend = computeMovingAverage(latencies, 3);
  return [
    {
      key: 'latency',
      label: 'Latency ms',
      color: SERIES_COLORS.latency,
      marker: 'diamond',
      lineWidth: 3.2,
      opacity: 1,
      getValue: (p) => p.latencyMs ?? 0,
    },
    {
      key: 'trend',
      label: 'Latency trend',
      color: SERIES_COLORS.latencyTrend,
      marker: 'triangleDown',
      lineWidth: 2.4,
      opacity: 0.95,
      getValue: (_p, i) => trend[i] ?? 0,
    },
  ];
}

function getMetricTitle(metric: ProfilerMetricType): string {
  switch (metric) {
    case 'data':
      return 'Payload Size Comparison';
    case 'latency':
      return 'Latency Comparison';
    default:
      return 'Token Flow Comparison';
  }
}

function formatAxisValue(value: number, metric: ProfilerMetricType): string {
  if (metric === 'tokens') {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
    return String(Math.round(value));
  }
  if (metric === 'data') {
    return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} KB`;
  }
  return value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${Math.round(value)}ms`;
}

function MarkerIcon({
  shape,
  color,
  x,
  y,
  size,
}: {
  shape: MarkerShape;
  color: string;
  x: number;
  y: number;
  size: number;
}) {
  const stroke = 'rgba(255,255,255,0.9)';
  switch (shape) {
    case 'square':
      return (
        <rect
          x={x - size}
          y={y - size}
          width={size * 2}
          height={size * 2}
          rx={2.5}
          fill={color}
          stroke={stroke}
          strokeWidth={1.4}
        />
      );
    case 'diamond':
      return (
        <polygon
          points={`${x},${y - size} ${x + size},${y} ${x},${y + size} ${x - size},${y}`}
          fill={color}
          stroke={stroke}
          strokeWidth={1.4}
        />
      );
    case 'triangleDown':
      return (
        <polygon
          points={`${x - size},${y - size * 0.7} ${x + size},${y - size * 0.7} ${x},${y + size}`}
          fill={color}
          stroke={stroke}
          strokeWidth={1.4}
        />
      );
    case 'triangleUp':
      return (
        <polygon
          points={`${x - size},${y + size * 0.7} ${x + size},${y + size * 0.7} ${x},${y - size}`}
          fill={color}
          stroke={stroke}
          strokeWidth={1.4}
        />
      );
    default:
      return <circle cx={x} cy={y} r={size} fill={color} stroke={stroke} strokeWidth={1.4} />;
  }
}

function LegendMarker({ shape, color }: { shape: MarkerShape; color: string }) {
  return (
    <svg viewBox="0 0 16 16" className="profiler-legend-marker" aria-hidden="true">
      <MarkerIcon shape={shape} color={color} x={8} y={8} size={5.2} />
    </svg>
  );
}

export function ProfilerChart({ detail, metric, onOpenSource }: ProfilerChartProps) {
  const timeline = [...detail.timeline].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const rawEventById = new Map(detail.rawEvents.map((event) => [event.id, event] as const));

  const seriesDefs = useMemo(() => buildSeriesDefs(metric, timeline), [metric, timeline]);

  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());
  const [scrollLeft, setScrollLeft] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(MIN_WIDTH);
  const [tooltip, setTooltip] = useState<{
    x: number;
    point: SessionTimelinePoint;
    index: number;
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const toggleSeries = useCallback((key: string) => {
    setHiddenSeries((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  // Compute chart width based on fixed time intervals
  const { chartWidth, minTime, maxTime } = useMemo(() => {
    const ts = timeline.map((p) => new Date(p.timestamp).valueOf());
    const min = Math.min(...ts);
    const max = Math.max(...timeline.map((p) => new Date(p.endTimestamp ?? p.timestamp).valueOf()));
    const spanMinutes = Math.max(1, (max - min) / 60_000);
    const w = Math.max(
      MIN_WIDTH,
      timeline.length * MIN_POINT_SPACING,
      Math.round(spanMinutes * PIXELS_PER_MINUTE),
    );
    return { chartWidth: w, minTime: min, maxTime: max };
  }, [timeline]);

  const plotWidth = chartWidth - PADDING.left - PADDING.right;
  const plotHeight = CHART_HEIGHT - PADDING.top - PADDING.bottom;

  // Build scales
  const xScale = useMemo(
    () =>
      scaleTime({
        domain: [new Date(minTime), new Date(maxTime)],
        range: [PADDING.left, PADDING.left + plotWidth],
      }),
    [minTime, maxTime, plotWidth],
  );

  const visibleWindow = useMemo(() => {
    const effectiveViewportWidth = Math.max(1, viewportWidth);
    const leftEdge = scrollLeft + PADDING.left;
    const rightEdge = scrollLeft + effectiveViewportWidth - PADDING.right;
    return {
      leftEdge,
      rightEdge,
    };
  }, [scrollLeft, viewportWidth]);

  const maxValue = useMemo(() => {
    const visibleIndexes = timeline
      .map((point, index) => {
        const x = xScale(new Date(point.timestamp)) ?? PADDING.left;
        return { index, x };
      })
      .filter(({ x }) => x >= visibleWindow.leftEdge && x <= visibleWindow.rightEdge)
      .map(({ index }) => index);

    const candidateIndexes = visibleIndexes.length > 0 ? visibleIndexes : timeline.map((_, i) => i);
    let max = 1;
    for (const s of seriesDefs) {
      if (hiddenSeries.has(s.key)) continue;
      for (const i of candidateIndexes) {
        const v = s.getValue(timeline[i], i);
        if (v > max) max = v;
      }
    }
    return max;
  }, [hiddenSeries, seriesDefs, timeline, visibleWindow.leftEdge, visibleWindow.rightEdge, xScale]);

  const yScale = useMemo(
    () =>
      scaleLinear({
        domain: [0, maxValue],
        range: [PADDING.top + plotHeight, PADDING.top],
        nice: true,
      }),
    [maxValue, plotHeight],
  );

  // Build point arrays for each visible series
  const seriesData = useMemo(() => {
    return seriesDefs.map((s) => ({
      ...s,
      points: timeline.map((p, i) => ({
        x: xScale(new Date(p.timestamp)) ?? PADDING.left,
        y: yScale(s.getValue(p, i)) ?? PADDING.top + plotHeight,
        value: s.getValue(p, i),
      })),
    }));
  }, [seriesDefs, timeline, xScale, yScale, plotHeight]);

  // Find raw event for a timeline point
  const findRawEvent = useCallback(
    (point: SessionTimelinePoint): SessionRawEventRef | undefined => {
      if (!point.sourceEventId) return undefined;
      return rawEventById.get(point.sourceEventId);
    },
    [rawEventById],
  );

  // Handle bar click
  const handleBarClick = useCallback(
    (point: SessionTimelinePoint) => {
      const raw = findRawEvent(point);
      if (raw) {
        onOpenSource(raw.filePath, raw.lineNumber);
      }
    },
    [findRawEvent, onOpenSource],
  );

  // Handle tooltip
  const handleMouseMove = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const scrollElement = scrollRef.current;
      if (!scrollElement) {
        return;
      }
      const bounds = scrollElement.getBoundingClientRect();
      const x = scrollElement.scrollLeft + event.clientX - bounds.left;
      if (x < PADDING.left || x > PADDING.left + plotWidth) {
        setTooltip(null);
        return;
      }
      // Find closest point
      let closestIdx = 0;
      let closestDist = Infinity;
      for (let i = 0; i < timeline.length; i++) {
        const px = xScale(new Date(timeline[i].timestamp)) ?? 0;
        const d = Math.abs(px - x);
        if (d < closestDist) {
          closestDist = d;
          closestIdx = i;
        }
      }
      if (closestDist < 40) {
        const px = xScale(new Date(timeline[closestIdx].timestamp)) ?? 0;
        setTooltip({
          x: px,
          point: timeline[closestIdx],
          index: closestIdx,
        });
      } else {
        setTooltip(null);
      }
    },
    [plotWidth, timeline, xScale],
  );

  // Scroll to end on mount
  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (scrollElement) {
      const nextViewportWidth = Math.max(scrollElement.clientWidth || 0, MIN_WIDTH);
      setViewportWidth(nextViewportWidth);
      scrollElement.scrollLeft = scrollElement.scrollWidth;
      setScrollLeft(scrollElement.scrollLeft);
    }
  }, [chartWidth]);

  useEffect(() => {
    const handleResize = () => {
      const scrollElement = scrollRef.current;
      if (!scrollElement) {
        return;
      }
      setViewportWidth(Math.max(scrollElement.clientWidth || 0, MIN_WIDTH));
      setScrollLeft(scrollElement.scrollLeft);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  if (timeline.length === 0) {
    return (
      <div className="profiler-empty-chart">No timeline samples available for this session.</div>
    );
  }

  const visibleSeries = seriesData.filter((s) => !hiddenSeries.has(s.key));
  const tooltipRawEvent = tooltip ? findRawEvent(tooltip.point) : undefined;
  const tooltipLeft = tooltip
    ? Math.max(
        TOOLTIP_MARGIN + TOOLTIP_APPROX_WIDTH / 2,
        Math.min(chartWidth - TOOLTIP_MARGIN - TOOLTIP_APPROX_WIDTH / 2, tooltip.x),
      )
    : 0;

  return (
    <div className="profiler-chart-panel">
      <div className="profiler-chart-head">
        <div>
          <div className="profiler-chart-title">{getMetricTitle(metric)}</div>
          <div className="profiler-chart-note">
            {timeline.length} samples | {seriesDefs.length} series
          </div>
        </div>
        <div className="profiler-chart-legend">
          {seriesDefs.map((s) => (
            <button
              key={s.key}
              className={`profiler-legend-item profiler-legend-toggle ${hiddenSeries.has(s.key) ? 'profiler-legend-hidden' : ''}`}
              onClick={() => toggleSeries(s.key)}
              title={`Toggle ${s.label}`}
            >
              <LegendMarker shape={s.marker} color={hiddenSeries.has(s.key) ? '#666' : s.color} />
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <div className="profiler-chart-viewport">
        <div className="profiler-chart-axis-rail" aria-hidden="true">
          <svg
            viewBox={`0 0 ${AXIS_RAIL_WIDTH} ${CHART_HEIGHT}`}
            className="profiler-chart-axis-svg"
          >
            <AxisLeft
              scale={yScale}
              left={AXIS_RAIL_WIDTH - 8}
              numTicks={4}
              tickFormat={(v) => formatAxisValue(v as number, metric)}
              stroke="transparent"
              tickStroke="transparent"
              tickLabelProps={{
                fill: 'var(--vscode-descriptionForeground, #888)',
                fontSize: 9,
                textAnchor: 'end',
                dx: '-0.35em',
              }}
            />
          </svg>
        </div>
        <div
          className="profiler-chart-scroll"
          ref={scrollRef}
          onScroll={(event) => {
            const target = event.currentTarget;
            setScrollLeft(target.scrollLeft);
            setViewportWidth(Math.max(target.clientWidth || 0, MIN_WIDTH));
          }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setTooltip(null)}
        >
          <div className="profiler-chart-inner" style={{ width: chartWidth }}>
            <svg
              viewBox={`0 0 ${chartWidth} ${CHART_HEIGHT}`}
              className="profiler-chart-svg"
              aria-label={getMetricTitle(metric)}
            >
              {/* Background frame */}
              <rect
                x={PADDING.left}
                y={PADDING.top}
                width={plotWidth}
                height={plotHeight}
                className="profiler-chart-frame"
                rx={14}
                ry={14}
              />

              {/* Grid rows */}
              <GridRows
                scale={yScale}
                width={plotWidth}
                left={PADDING.left}
                numTicks={4}
                stroke="var(--vscode-panel-border, #333)"
                strokeOpacity={0.72}
                strokeDasharray="3 8"
              />

              {/* Bar chart layer: each timeline point gets a bar */}
              <Group>
                {timeline.map((point, i) => {
                  const px = xScale(new Date(point.timestamp)) ?? PADDING.left;
                  const primaryValue =
                    metric === 'data'
                      ? (point.payloadKb ?? 0)
                      : metric === 'latency'
                        ? (point.latencyMs ?? 0)
                        : (point.totalTokens ?? getTokenTotal(point));
                  const barHeight = Math.max(
                    1,
                    (primaryValue / Math.max(1, maxValue)) * plotHeight,
                  );
                  const barY = PADDING.top + plotHeight - barHeight;
                  const raw = findRawEvent(point);
                  const hasRawRef = !!raw;
                  return (
                    <rect
                      key={`bar-${point.id}`}
                      x={px - BAR_WIDTH / 2}
                      y={barY}
                      width={BAR_WIDTH}
                      height={barHeight}
                      rx={2}
                      className={`profiler-chart-bar ${hasRawRef ? 'profiler-chart-bar-clickable' : ''}`}
                      fill={SERIES_COLORS.total}
                      fillOpacity={0.12}
                      stroke={SERIES_COLORS.total}
                      strokeOpacity={0.25}
                      strokeWidth={0.5}
                      style={{ cursor: hasRawRef ? 'pointer' : 'default' }}
                      onClick={() => handleBarClick(point)}
                    />
                  );
                })}
              </Group>

              {/* Area fill for first visible series */}
              {visibleSeries.length > 0 && visibleSeries[0].points.length > 1 && (
                <path
                  d={
                    `M ${visibleSeries[0].points[0].x},${PADDING.top + plotHeight} ` +
                    visibleSeries[0].points
                      .map((p) => `L ${p.x.toFixed(2)},${p.y.toFixed(2)}`)
                      .join(' ') +
                    ` L ${visibleSeries[0].points[visibleSeries[0].points.length - 1].x},${PADDING.top + plotHeight} Z`
                  }
                  fill={visibleSeries[0].color}
                  opacity={0.08}
                />
              )}

              {/* Line paths */}
              {visibleSeries.map((s) => (
                <LinePath
                  key={s.key}
                  data={s.points}
                  x={(d) => d.x}
                  y={(d) => d.y}
                  stroke={s.color}
                  strokeWidth={s.lineWidth}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={s.opacity}
                />
              ))}

              {/* Endpoint markers */}
              {visibleSeries.map((s) => {
                const last = s.points[s.points.length - 1];
                if (!last) return null;
                return (
                  <MarkerIcon
                    key={`marker-${s.key}`}
                    shape={s.marker}
                    color={s.color}
                    x={last.x}
                    y={last.y}
                    size={7.5}
                  />
                );
              })}

              {/* Baseline */}
              <line
                x1={PADDING.left}
                y1={PADDING.top + plotHeight}
                x2={PADDING.left + plotWidth}
                y2={PADDING.top + plotHeight}
                className="profiler-chart-baseline"
              />

              {/* Bottom X-axis */}
              <AxisBottom
                scale={xScale}
                top={CHART_HEIGHT - PADDING.bottom + 4}
                numTicks={Math.min(8, Math.max(3, Math.floor(plotWidth / 120)))}
                stroke="transparent"
                tickStroke="transparent"
                tickLabelProps={{
                  fill: 'var(--vscode-descriptionForeground, #888)',
                  fontSize: 9,
                  textAnchor: 'middle',
                }}
              />

              {/* Tooltip crosshair */}
              {tooltip && (
                <Group>
                  <line
                    x1={tooltip.x}
                    y1={PADDING.top}
                    x2={tooltip.x}
                    y2={PADDING.top + plotHeight}
                    stroke="var(--vscode-focusBorder, #007acc)"
                    strokeWidth={1}
                    strokeDasharray="4 4"
                    opacity={0.6}
                  />
                  {visibleSeries.map((s) => {
                    const pt = s.points[tooltip.index];
                    if (!pt) return null;
                    return (
                      <circle
                        key={`tt-${s.key}`}
                        cx={pt.x}
                        cy={pt.y}
                        r={4}
                        fill={s.color}
                        stroke="white"
                        strokeWidth={1.5}
                      />
                    );
                  })}
                </Group>
              )}

              {/* Invisible overlay preserves a stable hit area for chart hover */}
              <rect
                x={PADDING.left}
                y={PADDING.top}
                width={plotWidth}
                height={plotHeight}
                fill="transparent"
              />
            </svg>

            {/* Tooltip card */}
            {tooltip && (
              <button
                type="button"
                className={`profiler-chart-tooltip ${tooltipRawEvent ? 'profiler-chart-tooltip-action' : ''}`}
                style={{
                  left: tooltipLeft,
                  top: 8,
                  transform: 'translateX(-50%)',
                }}
                onClick={() => {
                  if (tooltipRawEvent) {
                    onOpenSource(tooltipRawEvent.filePath, tooltipRawEvent.lineNumber);
                  }
                }}
                disabled={!tooltipRawEvent}
                title={
                  tooltipRawEvent
                    ? `Open source line ${tooltipRawEvent.lineNumber}`
                    : 'No source line linked to this sample'
                }
              >
                <div className="profiler-tooltip-time">
                  {new Date(tooltip.point.timestamp).toLocaleString()}
                </div>
                <div className="profiler-tooltip-data">
                  {visibleSeries.map((s) => (
                    <span key={s.key} className="profiler-tooltip-data-item">
                      <span style={{ color: s.color }}>{s.label}</span>
                      <strong>
                        {formatAxisValue(s.getValue(tooltip.point, tooltip.index), metric)}
                      </strong>
                    </span>
                  ))}
                </div>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
