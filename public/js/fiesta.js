// Mateo's band at Casa Fiesta: a cheerful, original little waltz played on a synthesized
// guitarrón (the big bass guitar: oom…), vihuela strums (…pah-pah!) and, on Taco Tuesday, a
// trumpet with the tune (the whole band plays!). You hear it near Mateo, louder the closer you
// are. Everything's made with the Web Audio API (no sound files).
const BEAT = 60 / 160; // seconds per beat (three to a bar)
const midi = n => 440 * 2 ** ((n - 69) / 12);
// Chords (root and its notes, as MIDI numbers).
const CHORDS = { G: [43, [55, 59, 62]], C: [48, [55, 60, 64]], D: [50, [54, 57, 62]] };
// Sixteen bars: [chord, the tune's three beats] (0: a rest, -1: keep holding the last note).
const SONG = [
  ['G', [71, 74, 79]], ['G', [78, 76, 74]], ['D', [69, 74, 78]], ['D', [76, 74, 72]],
  ['D', [69, 72, 76]], ['D', [74, 72, 69]], ['G', [71, 74, 79]], ['G', [79, -1, 0]],
  ['C', [76, 79, 76]], ['C', [72, 76, 79]], ['G', [74, 71, 67]], ['G', [71, 74, 79]],
  ['D', [78, 76, 74]], ['D', [72, 69, 66]], ['G', [67, 71, 74]], ['G', [79, -1, 0]],
];

export class FiestaBand {
  constructor(sounds) {
    this.sounds = sounds;
    this.next = null; // when the next beat plays (audio clock), while playing
    this.beat = 0;
    this.out = null;
    this.level = 0;
  }

  // Every frame: volume 0..1 (how close you are to Mateo), and whether the whole band's
  // playing (Taco Tuesday) or just Mateo's guitar.
  update(volume, full) {
    this.full = full;
    const ctx = volume > 0.01 ? this.sounds.ensure() : this.sounds.ctx;
    if (!ctx) return;
    if (!this.out) {
      this.out = ctx.createGain();
      this.out.gain.value = 0;
      this.out.connect(this.sounds.master);
    }
    this.level += (volume - this.level) * 0.1;
    this.out.gain.setTargetAtTime(this.level * 0.5, ctx.currentTime, 0.1);
    if (this.level < 0.01) {
      this.next = null; // (stopped: starts again from the top next time)
      this.beat = 0;
      return;
    }
    if (this.next === null || this.next < ctx.currentTime) this.next = ctx.currentTime + 0.05;
    while (this.next < ctx.currentTime + 0.3) {
      this.play(ctx, this.beat, this.next);
      this.beat = (this.beat + 1) % (SONG.length * 3);
      this.next += BEAT;
    }
  }

  // One beat of the song, at audio time t.
  play(ctx, beat, t) {
    const [chord, tune] = SONG[Math.floor(beat / 3)], [root, notes] = CHORDS[chord], b = beat % 3;
    if (b === 0) this.pluck(ctx, midi(root - 12), t, 0.55, 'triangle', 0.5); // oom…
    else notes.forEach((n, i) => this.pluck(ctx, midi(n), t + i * 0.012, 0.18, 'triangle', 0.13)); // …pah-pah
    if (!this.full) return;
    const n = tune[b];
    if (n > 0) {
      let len = BEAT * 0.9;
      for (let k = b + 1; k < 3 && tune[k] === -1; k++) len += BEAT;
      this.trumpet(ctx, midi(n), t, len);
    }
  }

  pluck(ctx, f, t, dur, type, gain) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // A bright brassy note: two slightly different sawtooths through a filter that opens as it
  // starts, with a little vibrato.
  trumpet(ctx, f, t, dur) {
    const filter = ctx.createBiquadFilter(), g = ctx.createGain(), vib = ctx.createOscillator(), depth = ctx.createGain();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(700, t);
    filter.frequency.linearRampToValueAtTime(2600, t + 0.06);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.04);
    g.gain.setValueAtTime(0.13, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    vib.frequency.value = 5.5;
    depth.gain.value = f * 0.006;
    vib.connect(depth);
    for (const detune of [-6, 6]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = detune;
      depth.connect(o.frequency);
      o.connect(filter);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
    vib.start(t);
    vib.stop(t + dur + 0.05);
    filter.connect(g).connect(this.out);
  }
}
