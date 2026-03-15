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
const MIN_WIDTH = 640;
const BAR_WIDTH = 8;
const TOOLTIP_MARGIN = 12;
const TOOLTIP_APPROX_WIDTH = 380;
const MIN_RANGE_SCALE = 1;
const MAX_RANGE_SCALE = 8;
const PINCH_SCALE_SENSITIVITY = 0.004;

function getPointAnchorTimestamp(point: SessionTimelinePoint): string {
  return point.endTimestamp ?? point.timestamp;
}

function getPointChartTimestamp(point: SessionTimelinePoint, metric: ProfilerMetricType): string {
  if (metric === 'tokens' && point.chartTimestamp) {
    return point.chartTimestamp;
  }
  return getPointAnchorTimestamp(point);
}

function getTokenTotal(p: SessionTimelinePoint): number {
  return p.totalTokens ?? (p.inputTokens ?? 0) + (p.outputTokens ?? 0);
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
    const totals = timeline.map((p) => p.chartTotalTokens ?? p.totalTokens ?? getTokenTotal(p));
    const trend = computeMovingAverage(totals, 3);
    return [
      {
        key: 'total',
        label: 'Total',
        color: SERIES_COLORS.total,
        marker: 'circle',
        lineWidth: 3.2,
        opacity: 1,
        getValue: (p) => p.chartTotalTokens ?? p.totalTokens ?? getTokenTotal(p),
      },
      {
        key: 'output',
        label: 'Output',
        color: SERIES_COLORS.output,
        marker: 'square',
        lineWidth: 2.4,
        opacity: 1,
        getValue: (p) => p.chartOutputTokens ?? p.outputTokens ?? 0,
      },
      {
        key: 'input',
        label: 'Input',
        color: SERIES_COLORS.input,
        marker: 'diamond',
        lineWidth: 2.4,
        opacity: 1,
        getValue: (p) => p.chartInputTokens ?? p.inputTokens ?? 0,
      },
      {
        key: 'cached',
        label: 'Cached',
        color: SERIES_COLORS.cached,
        marker: 'triangleDown',
        lineWidth: 2.4,
        opacity: 1,
        getValue: (p) => p.chartCachedTokens ?? p.cachedTokens ?? 0,
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

function buildTokenSampleTimeline(detail: SessionDetail): SessionTimelinePoint[] {
  const tokenEvents = detail.rawEvents.filter((event) => {
    const hasTokenSnapshot =
      event.totalTokens !== undefined ||
      event.inputTokens !== undefined ||
      event.outputTokens !== undefined ||
      event.cachedTokens !== undefined;

    if (!event.timestamp || !hasTokenSnapshot) {
      return false;
    }

    switch (detail.summary.agent) {
      case 'codex':
        return event.eventType === 'token_count';
      case 'claude':
        return event.eventType === 'assistant';
      case 'gemini':
        return event.eventType !== 'tool_call';
      default:
        return false;
    }
  });

  return tokenEvents.map((event, index) => ({
    id: `${detail.summary.id}:token:${index + 1}`,
    timestamp: event.timestamp!,
    endTimestamp: event.timestamp,
    inputTokens: event.inputTokens,
    outputTokens: event.outputTokens,
    cachedTokens: event.cachedTokens,
    totalTokens:
      event.totalTokens ??
      (event.inputTokens ?? 0) + (event.outputTokens ?? 0) + (event.cachedTokens ?? 0),
    maxTokens: event.maxTokens,
    eventType: 'token_count',
    label: `S${String(index + 1).padStart(2, '0')}`,
    detail: event.summary,
    sourceEventId: event.id,
  }));
}

export function ProfilerChart({ detail, metric, onOpenSource }: ProfilerChartProps) {
  const tokenTimeline = buildTokenSampleTimeline(detail);
  const chartTimeline =
    metric === 'tokens' && tokenTimeline.length > 0 ? tokenTimeline : detail.timeline;

  const timeline = [...chartTimeline].sort((a, b) =>
    getPointChartTimestamp(a, metric).localeCompare(getPointChartTimestamp(b, metric)),
  );
  const rawEventById = new Map(detail.rawEvents.map((event) => [event.id, event] as const));
  const contextWindowLimit = useMemo(
    () =>
      [...detail.timeline, ...tokenTimeline].reduce(
        (max, point) => Math.max(max, point.maxTokens ?? 0),
        0,
      ),
    [detail.timeline, tokenTimeline],
  );

  const seriesDefs = useMemo(() => buildSeriesDefs(metric, timeline), [metric, timeline]);

  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());
  const [scrollLeft, setScrollLeft] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(MIN_WIDTH);
  const [rangeScale, setRangeScale] = useState(MIN_RANGE_SCALE);
  const [tooltip, setTooltip] = useState<{
    x: number;
    point: SessionTimelinePoint;
    index: number;
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const previousChartWidthRef = useRef<number | null>(null);
  const pinchAnchorRef = useRef<{ ratio: number; viewportOffset: number } | null>(null);

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

  const resolvedViewportWidth = viewportWidth > 1 ? viewportWidth : MIN_WIDTH;

  // Fit the full timeline into the viewport by default, then expand horizontally while pinching.
  const { chartWidth, minTime, maxTime } = useMemo(() => {
    const ts = timeline.map((p) => new Date(getPointChartTimestamp(p, metric)).valueOf());
    const min = Math.min(...ts);
    const max = Math.max(...ts);
    const w = Math.max(resolvedViewportWidth, Math.round(resolvedViewportWidth * rangeScale));
    return { chartWidth: w, minTime: min, maxTime: max };
  }, [metric, rangeScale, resolvedViewportWidth, timeline]);

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
        const x = xScale(new Date(getPointChartTimestamp(point, metric))) ?? PADDING.left;
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
  }, [
    hiddenSeries,
    metric,
    seriesDefs,
    timeline,
    visibleWindow.leftEdge,
    visibleWindow.rightEdge,
    xScale,
  ]);

  const chartMaxValue =
    metric === 'tokens' && contextWindowLimit > 0
      ? Math.max(maxValue, contextWindowLimit)
      : maxValue;

  const yScale = useMemo(
    () =>
      scaleLinear({
        domain: [0, chartMaxValue],
        range: [PADDING.top + plotHeight, PADDING.top],
        nice: true,
      }),
    [chartMaxValue, plotHeight],
  );

  // Build point arrays for each visible series
  const seriesData = useMemo(() => {
    return seriesDefs.map((s) => ({
      ...s,
      points: timeline.map((p, i) => ({
        x: xScale(new Date(getPointChartTimestamp(p, metric))) ?? PADDING.left,
        y: yScale(s.getValue(p, i)) ?? PADDING.top + plotHeight,
        value: s.getValue(p, i),
      })),
    }));
  }, [metric, seriesDefs, timeline, xScale, yScale, plotHeight]);

  // Find raw event for a timeline point
  const findRawEvent = useCallback(
    (point: SessionTimelinePoint): SessionRawEventRef | undefined => {
      if (!point.sourceEventId) return undefined;
      return rawEventById.get(point.sourceEventId);
    },
    [rawEventById],
  );

  const clickHotspots = useMemo(() => {
    return timeline
      .map((point, index) => {
        const raw = findRawEvent(point);
        if (!raw) {
          return null;
        }

        const x = xScale(new Date(getPointChartTimestamp(point, metric))) ?? PADDING.left;
        const previousX =
          index > 0
            ? (xScale(new Date(getPointChartTimestamp(timeline[index - 1], metric))) ??
              PADDING.left)
            : PADDING.left;
        const nextX =
          index < timeline.length - 1
            ? (xScale(new Date(getPointChartTimestamp(timeline[index + 1], metric))) ??
              PADDING.left)
            : PADDING.left + plotWidth;
        const left = index === 0 ? PADDING.left : Math.max(PADDING.left, (previousX + x) / 2);
        const right =
          index === timeline.length - 1
            ? PADDING.left + plotWidth
            : Math.min(PADDING.left + plotWidth, (x + nextX) / 2);

        return {
          point,
          index,
          raw,
          x,
          left,
          width: Math.max(BAR_WIDTH + 14, right - left),
        };
      })
      .filter(
        (
          hotspot,
        ): hotspot is {
          point: SessionTimelinePoint;
          index: number;
          raw: SessionRawEventRef;
          x: number;
          left: number;
          width: number;
        } => hotspot !== null,
      );
  }, [findRawEvent, metric, plotWidth, timeline, xScale]);

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
        const px = xScale(new Date(getPointChartTimestamp(timeline[i], metric))) ?? 0;
        const d = Math.abs(px - x);
        if (d < closestDist) {
          closestDist = d;
          closestIdx = i;
        }
      }
      if (closestDist < 40) {
        const px = xScale(new Date(getPointChartTimestamp(timeline[closestIdx], metric))) ?? 0;
        setTooltip({
          x: px,
          point: timeline[closestIdx],
          index: closestIdx,
        });
      } else {
        setTooltip(null);
      }
    },
    [metric, plotWidth, timeline, xScale],
  );

  const handleWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      if (!event.ctrlKey) {
        return;
      }

      const scrollElement = scrollRef.current;
      if (!scrollElement) {
        return;
      }

      event.preventDefault();
      const bounds = scrollElement.getBoundingClientRect();
      const viewportOffset = Math.max(
        PADDING.left,
        Math.min(
          event.clientX - bounds.left,
          Math.max(PADDING.left, scrollElement.clientWidth - PADDING.right),
        ),
      );
      const currentWidth = previousChartWidthRef.current ?? chartWidth;
      pinchAnchorRef.current = {
        ratio: Math.max(0, Math.min(1, (scrollElement.scrollLeft + viewportOffset) / currentWidth)),
        viewportOffset,
      };

      setRangeScale((prev) => {
        const next = prev * Math.exp(-event.deltaY * PINCH_SCALE_SENSITIVITY);
        return Math.max(MIN_RANGE_SCALE, Math.min(MAX_RANGE_SCALE, next));
      });
    },
    [chartWidth],
  );

  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (scrollElement) {
      const nextViewportWidth = Math.max(scrollElement.clientWidth || 0, 1);
      setViewportWidth(nextViewportWidth);
      const previousChartWidth = previousChartWidthRef.current;
      const maxPreviousScroll =
        previousChartWidth !== null ? Math.max(0, previousChartWidth - nextViewportWidth) : 0;
      const maxNextScroll = Math.max(0, chartWidth - nextViewportWidth);

      let nextScrollLeft = 0;
      if (pinchAnchorRef.current && maxNextScroll > 0) {
        nextScrollLeft =
          pinchAnchorRef.current.ratio * chartWidth - pinchAnchorRef.current.viewportOffset;
      } else if (previousChartWidth !== null && maxPreviousScroll > 0 && maxNextScroll > 0) {
        nextScrollLeft = (scrollElement.scrollLeft / maxPreviousScroll) * maxNextScroll;
      }

      const clampedScrollLeft = Math.max(0, Math.min(maxNextScroll, nextScrollLeft));
      scrollElement.scrollLeft = clampedScrollLeft;
      setScrollLeft(clampedScrollLeft);
      previousChartWidthRef.current = chartWidth;
      pinchAnchorRef.current = null;
    }
  }, [chartWidth]);

  useEffect(() => {
    const handleResize = () => {
      const scrollElement = scrollRef.current;
      if (!scrollElement) {
        return;
      }
      setViewportWidth(Math.max(scrollElement.clientWidth || 0, 1));
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
            {metric === 'tokens' && contextWindowLimit > 0 && (
              <Group>
                <line
                  x1={AXIS_RAIL_WIDTH - 22}
                  y1={yScale(contextWindowLimit)}
                  x2={AXIS_RAIL_WIDTH - 10}
                  y2={yScale(contextWindowLimit)}
                  className="profiler-chart-limit-axis-line"
                />
                <text
                  x={AXIS_RAIL_WIDTH - 24}
                  y={yScale(contextWindowLimit)}
                  className="profiler-chart-limit-label"
                  textAnchor="end"
                  dominantBaseline="central"
                >
                  {formatAxisValue(contextWindowLimit, metric)}
                </text>
              </Group>
            )}
          </svg>
        </div>
        <div
          className="profiler-chart-scroll"
          ref={scrollRef}
          onScroll={(event) => {
            const target = event.currentTarget;
            setScrollLeft(target.scrollLeft);
            setViewportWidth(Math.max(target.clientWidth || 0, 1));
          }}
          onWheel={handleWheel}
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
                pointerEvents="none"
              />

              {metric === 'tokens' && contextWindowLimit > 0 && (
                <line
                  x1={PADDING.left}
                  y1={yScale(contextWindowLimit)}
                  x2={PADDING.left + plotWidth}
                  y2={yScale(contextWindowLimit)}
                  className="profiler-chart-limit-line"
                  pointerEvents="none"
                />
              )}

              {/* Bar chart layer: each timeline point gets a bar */}
              <Group>
                {timeline.map((point, i) => {
                  const px =
                    xScale(new Date(getPointChartTimestamp(point, metric))) ?? PADDING.left;
                  const primaryValue =
                    metric === 'data'
                      ? (point.payloadKb ?? 0)
                      : metric === 'latency'
                        ? (point.latencyMs ?? 0)
                        : (point.chartTotalTokens ?? point.totalTokens ?? getTokenTotal(point));
                  const barHeight = Math.max(
                    1,
                    (primaryValue / Math.max(1, chartMaxValue)) * plotHeight,
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
                      fillOpacity={0.18}
                      stroke={SERIES_COLORS.total}
                      strokeOpacity={0.34}
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
                  pointerEvents="none"
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
                  pointerEvents="none"
                />
              ))}

              {/* Baseline */}
              <line
                x1={PADDING.left}
                y1={PADDING.top + plotHeight}
                x2={PADDING.left + plotWidth}
                y2={PADDING.top + plotHeight}
                className="profiler-chart-baseline"
                pointerEvents="none"
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
                    pointerEvents="none"
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
                        pointerEvents="none"
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
                pointerEvents="none"
              />
            </svg>

            <div className="profiler-chart-hotspots">
              {clickHotspots.map((hotspot) => (
                <button
                  key={`hotspot-${hotspot.point.id}`}
                  type="button"
                  className="profiler-chart-hotspot"
                  data-profiler-chart-hotspot="true"
                  data-line-number={String(hotspot.raw.lineNumber)}
                  style={{
                    left: hotspot.left,
                    top: PADDING.top,
                    width: hotspot.width,
                    height: plotHeight,
                  }}
                  title={`Open source line ${hotspot.raw.lineNumber}`}
                  onMouseEnter={() =>
                    setTooltip({
                      x: hotspot.x,
                      point: hotspot.point,
                      index: hotspot.index,
                    })
                  }
                  onFocus={() =>
                    setTooltip({
                      x: hotspot.x,
                      point: hotspot.point,
                      index: hotspot.index,
                    })
                  }
                  onClick={() => handleBarClick(hotspot.point)}
                />
              ))}
            </div>

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
                  {new Date(getPointChartTimestamp(tooltip.point, metric)).toLocaleString()}
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
