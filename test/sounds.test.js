'use strict';

// Guards against shipping silent built-in sounds again (1.0 shipped three of them).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { SOUNDS } = require('../src/main/reminders');

const dir = path.join(__dirname, '..', 'assets', 'sounds');

for (const { id } of SOUNDS) {
  test(`${id}.wav is a real, audible 16-bit mono WAV`, () => {
    const buf = fs.readFileSync(path.join(dir, `${id}.wav`));
    assert.equal(buf.toString('ascii', 0, 4), 'RIFF');
    assert.equal(buf.readUInt16LE(22), 1);
    assert.equal(buf.readUInt16LE(34), 16);
    let peak = 0;
    let sum = 0;
    const samples = (buf.length - 44) / 2;
    for (let i = 0; i < samples; i++) {
      const v = Math.abs(buf.readInt16LE(44 + i * 2)) / 32768;
      peak = Math.max(peak, v);
      sum += v * v;
    }
    assert.ok(peak > 0.5, `peak ${peak}`);
    assert.ok(Math.sqrt(sum / samples) > 0.02, 'too quiet overall');
  });
}
