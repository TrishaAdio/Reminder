// Frame-time probe for `--perf`: samples requestAnimationFrame deltas while the card animates.
export function measureFrames(ms) {
  return new Promise((resolve) => {
    const deltas = [];
    let last = null;
    let end = null;
    const frame = (t) => {
      if (last != null) deltas.push(t - last);
      last = t;
      end ??= t + ms;
      if (t < end) requestAnimationFrame(frame);
      else resolve(summarize(deltas));
    };
    requestAnimationFrame(frame);
  });
}

function summarize(deltas) {
  const sorted = [...deltas].sort((a, b) => a - b);
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  const median = at(0.5);
  return {
    frames: deltas.length,
    p50: Number(median.toFixed(2)),
    p95: Number(at(0.95).toFixed(2)),
    max: Number(sorted.at(-1).toFixed(2)),
    refreshHz: Math.round(1000 / median),
    dropped: deltas.filter((d) => d > median * 1.5).length,
  };
}
