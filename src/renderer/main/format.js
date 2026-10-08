const DAY = 86_400_000;
const WEEKDAYS = [1, 2, 3, 4, 5];

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
// 2024-01-07 was a Sunday, so day index d maps to 7 + d.
const sampleDay = (d) => new Date(2024, 0, 7 + d);

export function minutesBetween(from, to) {
  const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  return (toMin(to) - toMin(from) + 1440) % 1440 || 1440;
}

export function createFormat({ locale, hourCycle }) {
  const time = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', hourCycle });
  const short = new Intl.DateTimeFormat(locale, { weekday: 'short' });
  const long = new Intl.DateTimeFormat(locale, { weekday: 'long' });
  const narrow = new Intl.DateTimeFormat(locale, { weekday: 'narrow' });
  const periodParts = (h) =>
    new Intl.DateTimeFormat(locale, { hour: 'numeric', hourCycle: 'h12' })
      .formatToParts(new Date(2024, 0, 1, h))
      .find((p) => p.type === 'dayPeriod')?.value;
  const info = new Intl.Locale(locale);
  const firstDay = (info.getWeekInfo?.() ?? info.weekInfo)?.firstDay ?? 1;
  const weekOrder = Array.from({ length: 7 }, (_, i) => (firstDay + i) % 7);

  const clock = (hhmm) => time.format(new Date(2024, 0, 1, Number(hhmm.slice(0, 2)), Number(hhmm.slice(3))));

  function days(list) {
    const set = new Set(list);
    if (set.size === 7) return 'every day';
    if (set.size === 5 && WEEKDAYS.every((d) => set.has(d))) return 'weekdays';
    if (set.size === 2 && set.has(0) && set.has(6)) return 'weekends';
    const picked = weekOrder.filter((d) => set.has(d));
    const first = weekOrder.indexOf(picked[0]);
    const contiguous = picked.every((d, i) => weekOrder[first + i] === d);
    if (contiguous && picked.length >= 3) return `${short.format(sampleDay(picked[0]))}–${short.format(sampleDay(picked.at(-1)))}`;
    return picked.map((d) => short.format(sampleDay(d))).join(', ');
  }

  function duration(minutes) {
    if (minutes % 60 === 0) return minutes === 60 ? '1 hour' : `${minutes / 60} hours`;
    if (minutes > 60) return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
    return `${minutes} min`;
  }

  const every = (minutes) => (minutes === 60 ? 'every hour' : `every ${duration(minutes)}`);

  return {
    hourCycle,
    periods: [periodParts(9) ?? 'AM', periodParts(21) ?? 'PM'],
    weekOrder,
    dayName: (d) => long.format(sampleDay(d)),
    dayLetter: (d) => narrow.format(sampleDay(d)),
    clock,
    duration,

    // Compact form for the sidebar: the active window lives in the detail view.
    brief(s) {
      if (!s.days.length) return 'No days selected';
      const d = days(s.days);
      if (s.type === 'daily') return d === 'every day' ? `Daily at ${clock(s.time)}` : `${capitalize(d)} at ${clock(s.time)}`;
      return d === 'every day' ? capitalize(every(s.every)) : `${capitalize(every(s.every))}, ${d}`;
    },

    summary(s) {
      if (!s.days.length) return 'No days selected';
      const d = days(s.days);
      if (s.type === 'daily') return d === 'every day' ? `Daily at ${clock(s.time)}` : `${capitalize(d)} at ${clock(s.time)}`;
      const base = `${capitalize(every(s.every))}, ${clock(s.from)}–${clock(s.to)}`;
      return d === 'every day' ? base : `${base}, ${d}`;
    },

    status(reminder, runtime, now = Date.now()) {
      if (!reminder.enabled) return 'Off';
      if (!runtime) return '';
      if (runtime.status === 'due') return 'On screen now';
      if (runtime.nextAt == null) return 'Never fires with these settings';
      const at = new Date(runtime.nextAt);
      const t = time.format(at);
      const diff = Math.round((startOfDay(at) - startOfDay(new Date(now))) / DAY);
      if (runtime.status === 'snoozed') return diff === 0 ? `Waiting, back at ${t}` : `Waiting, back ${long.format(at)} at ${t}`;
      if (diff === 0) return `Today at ${t}`;
      if (diff === 1) return `Tomorrow at ${t}`;
      return `${long.format(at)} at ${t}`;
    },
  };
}
