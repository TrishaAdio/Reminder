const DAY = 86_400_000;
const MINUTE = 60_000;
const WEEKDAYS = [1, 2, 3, 4, 5];

const startOfDay = (ms) => {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
// 2024-01-07 was a Sunday, so day index d maps to 7 + d.
const sampleDay = (d) => new Date(2024, 0, 7 + d);

export function minutesBetween(from, to) {
  const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  return (toMin(to) - toMin(from) + 1440) % 1440 || 1440;
}

export function createFormat({ locale, hourCycle }) {
  const timeFmt = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', hourCycle });
  const short = new Intl.DateTimeFormat(locale, { weekday: 'short' });
  const long = new Intl.DateTimeFormat(locale, { weekday: 'long' });
  const narrow = new Intl.DateTimeFormat(locale, { weekday: 'narrow' });
  const hourOnly = new Intl.DateTimeFormat(locale, { hour: 'numeric', hourCycle });
  const periodOf = (h) =>
    new Intl.DateTimeFormat(locale, { hour: 'numeric', hourCycle: 'h12' })
      .formatToParts(new Date(2024, 0, 1, h))
      .find((p) => p.type === 'dayPeriod')?.value;
  const info = new Intl.Locale(locale);
  const firstDay = (info.getWeekInfo?.() ?? info.weekInfo)?.firstDay ?? 1;
  const weekOrder = Array.from({ length: 7 }, (_, i) => (firstDay + i) % 7);

  const time = (ms) => timeFmt.format(ms);
  const clock = (hhmm) => timeFmt.format(new Date(2024, 0, 1, Number(hhmm.slice(0, 2)), Number(hhmm.slice(3))));

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

  // "in 12 min", "in 2 h 5 min", "at 22:30", "tomorrow at 8:30", "Monday at 8:30"
  function relative(at, now = Date.now()) {
    const diff = at - now;
    if (diff < MINUTE) return diff <= 0 ? 'now' : 'in less than a minute';
    const mins = Math.ceil(diff / MINUTE);
    if (mins < 60) return `in ${mins} min`;
    const dayDiff = Math.round((startOfDay(at) - startOfDay(now)) / DAY);
    if (mins < 6 * 60) {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return m ? `in ${h} h ${m} min` : `in ${h} h`;
    }
    if (dayDiff === 0) return `at ${time(at)}`;
    if (dayDiff === 1) return `tomorrow at ${time(at)}`;
    return `${long.format(at)} at ${time(at)}`;
  }

  // Compact form for list rows.
  function soon(at, now = Date.now()) {
    const diff = at - now;
    if (diff < MINUTE) return 'now';
    const mins = Math.ceil(diff / MINUTE);
    if (mins < 60) return `${mins} min`;
    const dayDiff = Math.round((startOfDay(at) - startOfDay(now)) / DAY);
    if (mins < 6 * 60) return `${Math.floor(mins / 60)} h ${mins % 60 ? `${mins % 60} min` : ''}`.trim();
    if (dayDiff === 0) return time(at);
    return `${short.format(at)} ${time(at)}`;
  }

  return {
    hourCycle,
    periods: [periodOf(9) ?? 'AM', periodOf(21) ?? 'PM'],
    weekOrder,
    dayName: (d) => long.format(sampleDay(d)),
    dayLetter: (d) => narrow.format(sampleDay(d)),
    hourLabel: (h) => hourOnly.format(new Date(2024, 0, 1, h)),
    time,
    clock,
    days,
    duration,
    relative,
    soon,

    // "Every day, 22:30" · "Weekdays, 8:30" · "Every hour, 9:00–18:00, weekdays"
    schedule(s) {
      if (!s.days.length) return 'No days selected';
      const d = days(s.days);
      if (s.type === 'daily') return `${capitalize(d)}, ${clock(s.time)}`;
      const base = `${capitalize(every(s.every))}, ${clock(s.from)}–${clock(s.to)}`;
      return d === 'every day' ? base : `${base}, ${d}`;
    },

    status(reminder, runtime, now = Date.now()) {
      if (!reminder.enabled) return 'Off';
      if (!runtime) return '';
      if (runtime.status === 'due') return 'On screen now';
      if (runtime.nextAt == null) return 'Never comes up with these settings';
      const when = relative(runtime.nextAt, now);
      if (runtime.status === 'snoozed') return `Waiting, back ${when}`;
      return `Next ${when}`;
    },
  };
}
