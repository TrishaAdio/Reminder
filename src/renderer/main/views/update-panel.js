import { h } from '../dom.js';
import { icon } from '../../shared/icons.js';
import { animate, reducedMotion, FADE } from '../../shared/spring.js';

const dots = () => h('span', { class: 'dots', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'));

// Settings › About. Each status has its own icon, words and action; switching between
// them cross-fades, and only the progress bar moves while downloading.
export function updatePanel({ api, fmt }) {
  const slot = h('div', { class: 'update-slot' });
  const el = h('div', { class: 'update', role: 'status', 'aria-live': 'polite' }, slot);
  let shown = null;
  let bar = null;
  let percent = null;

  function content(st) {
    const button = (label, fn, primary = false, name = null) =>
      h('button', { class: `button ${primary ? 'primary' : ''} pressable`, type: 'button', onclick: fn }, name ? h('span', { html: icon(name) }) : null, label);
    const line = (iconEl, title, detail, action) =>
      h(
        'div',
        { class: 'update-line' },
        h('span', { class: `update-icon ${st.status}` }, iconEl),
        h('span', { class: 'update-text' }, h('span', { class: 'update-title' }, title), detail ? h('span', { class: 'update-detail t-small' }, detail) : null),
        action,
      );
    const i = (name) => h('span', { html: icon(name) });
    switch (st.status) {
      case 'unsupported':
        return line(i('download'), 'Updates come with the installed app', 'Run the installer build to get automatic updates.', null);
      case 'idle':
        return line(i('download'), 'Updates come from GitHub Releases', 'RemindAni checks quietly at launch and every 6 hours.', button('Check for updates', () => api.checkForUpdates()));
      case 'checking':
        return line(dots(), 'Checking for updates…', null, null);
      case 'none':
        return line(i('check-circle'), 'You’re up to date', st.checkedAt ? `Checked at ${fmt.time(st.checkedAt)}` : null, button('Check again', () => api.checkForUpdates()));
      case 'available':
        return line(i('download'), `Update ${st.version} available`, 'It downloads in the background. Your reminders stay as they are.', button('Download', () => api.downloadUpdate(), true));
      case 'downloading': {
        percent = h('span', { class: 'tnum' }, `${st.percent}%`);
        bar = h('span', { class: 'progress-fill' });
        const node = line(i('download'), h('span', {}, `Downloading ${st.version} · `, percent), null, null);
        node.append(h('span', { class: 'progress', role: 'progressbar', 'aria-label': 'Download', 'aria-valuemin': 0, 'aria-valuemax': 100 }, bar));
        return node;
      }
      case 'ready':
        return line(i('check-circle'), `Ready to install ${st.version}`, 'RemindAni closes, updates and opens again in a few seconds.', button('Restart and update', () => api.installUpdate(), true));
      case 'error':
        return line(i('alert'), 'Update failed', st.error, button('Try again', () => api.retryUpdate(), false, 'retry'));
      default:
        return line(i('download'), '', null, null);
    }
  }

  function setProgress(p) {
    if (!bar) return;
    bar.style.transform = `scaleX(${p / 100})`;
    percent.textContent = `${p}%`;
    bar.parentElement.setAttribute('aria-valuenow', p);
  }

  function set(st) {
    if (shown === st.status) {
      if (st.status === 'downloading') setProgress(st.percent);
      return;
    }
    const first = shown == null;
    shown = st.status;
    bar = null;
    const next = content(st);
    const old = slot.firstChild;
    if (old) {
      old.classList.add('leaving');
      const out = reducedMotion() ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-6px)' }];
      animate(old, out, reducedMotion() ? FADE : 'exit').then(() => old.remove());
    }
    slot.append(next);
    if (st.status === 'downloading') requestAnimationFrame(() => setProgress(st.percent));
    if (!first) {
      const into = reducedMotion() ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }];
      animate(next, into, reducedMotion() ? FADE : 'enter');
    }
  }

  return { el, set };
}
