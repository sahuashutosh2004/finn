"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import type { IChartApi, ISeriesApi, Time } from "lightweight-charts";
import Num from "@/components/Num";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { Skeleton } from "@/components/ui/Skeleton";
import { changeTone, formatDate, formatINR, formatPct, formatSignedINR } from "@/lib/format";
import type { Bar } from "@/lib/market";
import type { Receipt } from "@/lib/receipts";

type Range = "1M" | "6M" | "1Y";
const RANGES: { value: Range; label: string }[] = [
  { value: "1M", label: "1M" },
  { value: "6M", label: "6M" },
  { value: "1Y", label: "1Y" },
];
const MONTHS: Record<Range, number> = { "1M": 1, "6M": 6, "1Y": 12 };

type Props = {
  history: Bar[];
  lastClose: number;
  lastDate: string;
  dayChange: number | null;
  dayChangePct: number | null;
  closeReceipt?: Receipt | null;
  changeReceipt?: Receipt | null;
};

function sliceRange(history: Bar[], lastDate: string, range: Range): Bar[] {
  const cutoff = new Date(`${lastDate}T00:00:00Z`);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - MONTHS[range]);
  const c = cutoff.toISOString().slice(0, 10);
  return history.filter((b) => b.date > c);
}

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

const TONE_TEXT = { up: "text-up", down: "text-down", flat: "text-muted" };

export default function PriceChart({ history, lastClose, lastDate, dayChange, dayChangePct, closeReceipt, changeReceipt }: Props) {
  const [range, setRange] = useState<Range>("6M");
  const [hover, setHover] = useState<number | null>(null);
  const [ready, setReady] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Line"> | null>(null);

  const data = useMemo(() => sliceRange(history, lastDate, range), [history, lastDate, range]);
  const dataRef = useRef(data);
  const rangeTone = data.length > 1 ? changeTone(data[data.length - 1].close - data[0].close) : "flat";

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};

    import("lightweight-charts").then(({ createChart, LineSeries, ColorType, CrosshairMode, LineStyle }) => {
      const el = containerRef.current;
      if (disposed || !el) return;

      const chart = createChart(el, {
        autoSize: true,
        layout: {
          background: { type: ColorType.Solid, color: "transparent" },
          textColor: cssVar("--muted"),
          fontFamily: getComputedStyle(document.body).fontFamily,
          attributionLogo: false,
        },
        grid: { vertLines: { visible: false }, horzLines: { visible: false } },
        rightPriceScale: { visible: false },
        leftPriceScale: { visible: false },
        timeScale: { visible: false, fixLeftEdge: true, fixRightEdge: true },
        handleScroll: false,
        handleScale: false,
        crosshair: {
          mode: CrosshairMode.Magnet,
          vertLine: { color: cssVar("--muted"), width: 1, style: LineStyle.Solid, labelVisible: false },
          horzLine: { visible: false, labelVisible: false },
        },
      });
      const series = chart.addSeries(LineSeries, {
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerRadius: 4,
        crosshairMarkerBorderColor: cssVar("--bg"),
      });

      chart.subscribeCrosshairMove((param) => {
        const i = param.logical === undefined ? null : Math.round(param.logical);
        setHover(i !== null && i >= 0 && i < dataRef.current.length && param.point ? i : null);
      });

      const media = window.matchMedia("(prefers-color-scheme: dark)");
      const onScheme = () => {
        chart.applyOptions({
          layout: { textColor: cssVar("--muted") },
          crosshair: { vertLine: { color: cssVar("--muted") } },
        });
        series.applyOptions({ crosshairMarkerBorderColor: cssVar("--bg") });
      };
      media.addEventListener("change", onScheme);

      chartRef.current = chart;
      seriesRef.current = series;
      setReady(true);

      cleanup = () => {
        media.removeEventListener("change", onScheme);
        chart.remove();
        chartRef.current = null;
        seriesRef.current = null;
      };
    });

    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!ready || !chart || !series) return;
    const colorFor = () => cssVar(rangeTone === "up" ? "--up" : rangeTone === "down" ? "--down" : "--muted");
    series.setData(data.map((b) => ({ time: b.date as Time, value: b.close })));
    series.applyOptions({ color: colorFor() });
    chart.timeScale().fitContent();

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onScheme = () => series.applyOptions({ color: colorFor() });
    media.addEventListener("change", onScheme);
    return () => media.removeEventListener("change", onScheme);
  }, [ready, data, rangeTone]);

  // Touch: scrub immediately on drag instead of the library's long-press tracking mode.
  function onTouchPoint(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse") return;
    const chart = chartRef.current;
    const series = seriesRef.current;
    const el = containerRef.current;
    if (!chart || !series || !el) return;
    const x = e.clientX - el.getBoundingClientRect().left;
    const logical = chart.timeScale().coordinateToLogical(x);
    if (logical === null) return;
    const i = Math.max(0, Math.min(dataRef.current.length - 1, Math.round(logical)));
    const bar = dataRef.current[i];
    chart.setCrosshairPosition(bar.close, bar.date as Time, series);
    setHover(i);
  }

  function endTouch(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse") return;
    chartRef.current?.clearCrosshairPosition();
    setHover(null);
  }

  const point = hover !== null ? data[hover] : null;
  const start = data[0];
  const change = point && start ? point.close - start.close : dayChange;
  const changePct =
    point && start && start.close !== 0 ? ((point.close - start.close) / start.close) * 100 : dayChangePct;
  const tone = changeTone(change);

  return (
    <div>
      <p className="text-[32px] font-bold leading-10 tracking-[-0.02em]">
        <Num r={point ? null : closeReceipt}>{formatINR(point ? point.close : lastClose)}</Num>
      </p>
      <p className="text-[14px] leading-5">
        <Num r={point ? null : changeReceipt} className={`font-semibold ${TONE_TEXT[tone]}`}>
          {formatSignedINR(change)} ({formatPct(changePct)})
        </Num>{" "}
        <span className="text-muted">
          {point && start
            ? `${formatDate(point.date)} · vs ${formatDate(start.date, false)}`
            : `1D · ${formatDate(lastDate)} close`}
        </span>
      </p>

      <div className="relative mt-3 h-[200px]">
        {!ready ? <Skeleton className="absolute inset-0 rounded-lg" /> : null}
        <div
          ref={containerRef}
          className="absolute inset-0 touch-pan-y"
          onPointerDown={onTouchPoint}
          onPointerMove={(e) => (e.buttons || e.pointerType === "touch" ? onTouchPoint(e) : undefined)}
          onPointerUp={endTouch}
          onPointerCancel={endTouch}
          onPointerLeave={endTouch}
        />
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted">
        <span>{formatDate(start?.date, true)}</span>
        <span>{formatDate(data[data.length - 1]?.date, true)}</span>
      </div>

      <div className="mt-3">
        <SegmentedControl label="Chart range" options={RANGES} value={range} onChange={setRange} />
      </div>
    </div>
  );
}
