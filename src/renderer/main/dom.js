const PROPERTIES = new Set(['value', 'checked', 'disabled', 'hidden', 'tabIndex', 'maxLength', 'type', 'min', 'max', 'step', 'inert']);

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'html') el.innerHTML = value;
    else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (PROPERTIES.has(key)) el[key] = value;
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  el.append(...children.flat().filter((c) => c != null && c !== false));
  return el;
}

export function setText(el, text) {
  if (el.textContent !== text) el.textContent = text;
}

// Never overwrite what someone is typing.
export function setValue(input, value) {
  if (document.activeElement !== input && input.value !== value) input.value = value;
}
