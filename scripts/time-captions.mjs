/**
 * time-captions.mjs — derive caption timings from the audio itself (no STT).
 *
 * Uses ffmpeg's silencedetect to find the speech window (trimming the intro /
 * trailing silence) and the pauses between phrases, then distributes the caption
 * blocks across the real speech window (char-weighted) and snaps each block
 * boundary to the nearest detected pause. Writes start/end back into the caption
 * JSON files, preserving their text.
 *
 * Run:  node scripts/time-captions.mjs            (writes all venues)
 *       node scripts/time-captions.mjs --dry      (print only, no write)
 *
 * Requires ffmpeg on PATH. Reusable for any new scene: add it to JOBS.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const JOBS = [
  { id: 'museum-kota', audio: 'public/assets/Narasi/Audio/Museum Kota/1. Pembuka Virtual Tour.mp3' },
  { id: 'lagaligo',    audio: 'public/assets/Narasi/Audio/Lagaligo/1. Pintu Masuk.mp3' },
  { id: 'panlos',      audio: 'public/assets/Narasi/Audio/Panlos/1. Pintu Masuk KawasanWaterfront.mp3' },
];

const NOISE = '-30dB';   // below this level counts as silence
const MIN_SIL = 0.3;     // silencedetect minimum silence (s)
const PHRASE_GAP = 0.4;  // silences >= this are candidate phrase boundaries
const SNAP_TOL = 1.6;    // snap a char-weighted boundary to a pause within this (s)

function analyze(audio) {
  const r = spawnSync('ffmpeg',
    ['-hide_banner', '-nostats', '-i', audio, '-af', `silencedetect=noise=${NOISE}:d=${MIN_SIL}`, '-f', 'null', '-'],
    { encoding: 'utf8' });
  const text = (r.stdout || '') + (r.stderr || '');

  const silences = [];
  let curStart = null;
  for (const line of text.split('\n')) {
    const s = line.match(/silence_start:\s*(-?[\d.]+)/);
    const e = line.match(/silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/);
    if (s) curStart = Math.max(0, parseFloat(s[1]));
    if (e) {
      const end = parseFloat(e[1]); const dur = parseFloat(e[2]);
      silences.push({ start: curStart ?? Math.max(0, end - dur), end, dur });
      curStart = null;
    }
  }
  const dm = text.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
  const duration = dm ? (+dm[1]) * 3600 + (+dm[2]) * 60 + parseFloat(dm[3]) : null;

  // Merge silences split by a sub-MIN_SPEECH blip (a click/breath, not real
  // speech) so the intro/trailing trim and phrase boundaries aren't fooled.
  const MIN_SPEECH = 0.25;
  silences.sort((a, b) => a.start - b.start);
  const merged = [];
  for (const s of silences) {
    const last = merged[merged.length - 1];
    if (last && s.start - last.end < MIN_SPEECH) {
      last.end = s.end;
      last.dur = last.end - last.start;
    } else {
      merged.push({ ...s });
    }
  }
  return { silences: merged, duration };
}

function timeBlocks(texts, audio) {
  const { silences, duration } = analyze(audio);
  if (!duration) throw new Error(`No duration for ${audio}`);

  // Speech window: end of leading silence -> start of trailing silence.
  const leading = silences.filter(s => s.start <= 0.25);
  const speechStart = leading.length ? Math.max(...leading.map(s => s.end)) : 0;
  const trailing = silences.filter(s => s.end >= duration - 0.35);
  const speechEnd = trailing.length ? Math.min(...trailing.map(s => s.start)) : duration;

  // Candidate phrase boundaries = where speech resumes after a real pause.
  const candidates = silences
    .filter(s => s.dur >= PHRASE_GAP && s.end > speechStart + 0.2 && s.end < speechEnd - 0.2)
    .map(s => s.end);

  const span = speechEnd - speechStart;
  const totalChars = texts.reduce((n, t) => n + t.length, 0);

  // Char-weighted ideal internal boundaries, each snapped to nearest pause.
  const bounds = [speechStart];
  let acc = 0;
  for (let i = 0; i < texts.length - 1; i++) {
    acc += texts[i].length;
    const ideal = speechStart + (acc / totalChars) * span;
    let best = ideal, bestD = SNAP_TOL;
    for (const c of candidates) {
      const d = Math.abs(c - ideal);
      if (d < bestD) { best = c; bestD = d; }
    }
    bounds.push(Math.max(best, bounds[bounds.length - 1] + 0.4)); // keep monotonic
  }
  bounds.push(speechEnd);

  const round = (n) => Math.round(n * 100) / 100;
  return {
    meta: { duration: round(duration), speechStart: round(speechStart), speechEnd: round(speechEnd) },
    cues: texts.map((text, i) => ({ start: round(bounds[i]), end: round(bounds[i + 1]), text })),
  };
}

const dry = process.argv.includes('--dry');
for (const job of JOBS) {
  const path = `src/data/captions/${job.id}.json`;
  const texts = JSON.parse(readFileSync(path, 'utf8')).map(c => c.text);
  const { meta, cues } = timeBlocks(texts, job.audio);
  console.log(`\n${job.id}  (dur ${meta.duration}s, speech ${meta.speechStart}–${meta.speechEnd}s)`);
  for (const c of cues) console.log(`  ${String(c.start).padStart(6)} → ${String(c.end).padEnd(6)}  ${c.text.slice(0, 48)}`);
  if (!dry) {
    writeFileSync(path, JSON.stringify(cues, null, 2) + '\n');
  }
}
console.log(dry ? '\n(dry run — no files written)' : '\nCaption files updated.');
