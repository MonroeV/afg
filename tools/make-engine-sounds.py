#!/usr/bin/env python3
"""Makes the engine sounds in public/sounds/ (run it again after changing a voice: it needs numpy
and ffmpeg).

Each engine is built the way a real one makes its noise: every cylinder firing sends a pulse of
hot gas down the exhaust (a sharp thump with a rush of noise in it), and the exhaust pipes and the
muffler ring at their own frequencies, which gives each engine its character. A big crossplane V8
fires unevenly (that's the lumpy burble), a sports engine fires quick sharp pulses through a
free-flowing exhaust (the rasp), a diesel clatters as each injector fires and its turbo whines, and
an outboard motor is a buzzy little two-stroke.

Each voice is recorded at five engine speeds. Every recording repeats exactly every PERIOD seconds
(a whole number of engine cycles, with all the filtering done round the loop), so any PERIOD-long
piece of it loops without a click; the game plays the middle one, sped up or slowed down to the
engine speed it wants, and blends the two nearest recordings. The files are two periods long and
saved as MP3 (small, and every browser can play it).
"""
import json
import os
import subprocess
import tempfile

import numpy as np

FS = 24000  # samples a second
N = 36000  # samples in one loop (1.5 s): a multiple of 80, so it divides evenly at 44.1 and 48 kHz
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'sounds')

# Each voice: cylinders' firing angles (degrees through the cycle) and strengths, how quick the
# pulses are, the exhaust's resonances (Hz, sharpness, strength), the pipe (length in metres and
# how much bounces back), how far up the sound goes, and the engine speeds to record.
VOICES = {
    # An ordinary four-cylinder car: even, smooth, a bit buzzy, through a quiet muffler.
    'normal': dict(
        stroke=4, angles=[0, 180, 360, 540], amps=[1.0, 0.94, 0.99, 0.9], jitter=0.004,
        rise=0.35e-3, decay=2.4e-3, noise=0.32, noise_decay=3.5e-3,
        res=[(95, 1.1, 1.0), (240, 1.4, 0.55), (650, 1.8, 0.35), (1500, 2.0, 0.18)],
        pipe=(2.8, -0.45), cutoff=2600, lows=0.7, rpms=[800, 1400, 2400, 3800, 5800], idle=800, max=6000, gain=1.0,
    ),
    # A sports car: eight quick, sharp pulses through a free-flowing exhaust (bright and raspy).
    'sport': dict(
        stroke=4, angles=[0, 90, 180, 270, 360, 450, 540, 630], amps=[1.0, 0.9, 0.98, 0.92, 0.97, 0.89, 1.0, 0.93], jitter=0.003,
        rise=0.25e-3, decay=1.5e-3, noise=0.5, noise_decay=2.0e-3,
        res=[(170, 1.0, 1.0), (520, 1.6, 0.8), (1250, 2.2, 0.55), (2600, 2.5, 0.35)],
        pipe=(1.9, -0.5), cutoff=6500, lows=0.55, rpms=[1000, 1900, 3400, 5600, 8200], idle=1000, max=8400, gain=0.95,
    ),
    # A big V8 truck: a crossplane V8's uneven firing (lumpy and burbly), deep and boomy.
    'big': dict(
        stroke=4, angles=[0, 96, 176, 272, 360, 452, 538, 634], amps=[1.0, 0.6, 0.9, 0.68, 1.0, 0.57, 0.92, 0.64], jitter=0.006,
        rise=0.5e-3, decay=3.6e-3, noise=0.24, noise_decay=4.5e-3,
        res=[(52, 1.4, 1.5), (150, 1.2, 0.95), (390, 1.6, 0.45), (950, 2.0, 0.18)],
        pipe=(3.4, -0.5), cutoff=1900, lows=1.0, rpms=[650, 1100, 1900, 3000, 4600], idle=650, max=4800, gain=1.1,
    ),
    # A diesel (the dump truck and the RV): a six that clatters as each injector fires, and whines
    # from its turbo as it revs.
    'diesel': dict(
        stroke=4, angles=[0, 120, 240, 360, 480, 600], amps=[1.0, 0.93, 0.97, 0.95, 1.0, 0.92], jitter=0.005,
        rise=0.45e-3, decay=3.0e-3, noise=0.28, noise_decay=3.0e-3,
        res=[(68, 1.3, 1.2), (210, 1.3, 0.7), (560, 1.6, 0.35), (1300, 2.0, 0.15)],
        pipe=(3.0, -0.45), cutoff=3000, lows=1.0, clatter=(3300, 0.2), turbo=(2400, 0.02),
        rpms=[600, 950, 1450, 2100, 2900], idle=600, max=3000, gain=1.0,
    ),
    # An outboard motor (the boats): a two-stroke twin, fast and buzzy.
    'outboard': dict(
        stroke=2, angles=[0, 180], amps=[1.0, 0.9], jitter=0.006,
        rise=0.2e-3, decay=1.1e-3, noise=0.6, noise_decay=1.6e-3,
        res=[(280, 1.3, 0.8), (1050, 2.0, 0.85), (2700, 2.4, 0.5)],
        pipe=(0.7, -0.4), cutoff=5200, lows=0.3, rpms=[1100, 1900, 3000, 4400, 6200], idle=1100, max=6400, gain=0.85,
    ),
}


def spectrum_filter(x, gain_fn):
    """Filters a looping signal (round the loop, so it still loops cleanly)."""
    f = np.fft.rfftfreq(len(x), 1 / FS)
    return np.fft.irfft(np.fft.rfft(x) * gain_fn(f), len(x))


def circular_convolve(x, kernel):
    k = np.zeros(len(x))
    k[:len(kernel)] = kernel
    return np.fft.irfft(np.fft.rfft(x) * np.fft.rfft(k), len(x))


def peak(f, f0, q, g):
    """A resonance: strongest at f0, `q` sets how narrow."""
    ratio = np.maximum(f, 1e-3) / f0
    return g / np.sqrt(1 + (q * (ratio - 1 / ratio)) ** 2)


def render(v, rpm_wanted, rng):
    cycle_deg = 720 if v['stroke'] == 4 else 360
    cycle_s = (120 if v['stroke'] == 4 else 60) / rpm_wanted
    k = max(1, round(N / (cycle_s * FS)))  # whole engine cycles in one loop
    cycle = N / k  # samples per cycle (the engine speed is nudged a touch to fit exactly)
    rpm = (120 if v['stroke'] == 4 else 60) * FS / cycle
    # The firings: a spike at each one, a little uneven from cycle to cycle like a real engine.
    pulses = np.zeros(N)
    clicks = np.zeros(N)
    for j in range(k):
        wobble = 1 + 0.06 * rng.standard_normal()
        for a, amp in zip(v['angles'], v['amps']):
            t = (j + a / cycle_deg) * cycle + v['jitter'] * cycle * rng.standard_normal()
            i = int(round(t)) % N
            pulses[i] += amp * wobble * (1 + 0.05 * rng.standard_normal())
            clicks[(i + int(0.0008 * FS)) % N] += amp * (0.8 + 0.4 * rng.random())
    # Each firing: a sharp thump...
    n = np.arange(int(0.04 * FS)) / FS
    thump = np.exp(-n / v['decay']) - np.exp(-n / v['rise'])
    thump /= np.abs(thump).max()
    body = circular_convolve(pulses, thump)
    # ...and a rush of noise that dies away (the rasp of the gas).
    envelope = circular_convolve(np.abs(pulses), np.exp(-n / v['noise_decay']))
    rush = rng.standard_normal(N) * envelope
    rush = spectrum_filter(rush, lambda f: np.where(f > 120, 1.0, f / 120))
    x = body / (np.std(body) + 1e-9) + v['noise'] * rush / (np.std(rush) + 1e-9)
    # The exhaust: its resonances, the pipe (an echo bouncing back up it), a roll-off at the top
    # (the muffler), and the low end.
    delay = 2 * v['pipe'][0] / 343.0
    refl = v['pipe'][1]

    def exhaust(f):
        resonances = sum(peak(f, f0, q, g) for f0, q, g in v['res'])
        pipe = 1 / np.abs(1 - refl * np.exp(-2j * np.pi * f * delay))
        rolloff = 1 / np.sqrt(1 + (f / v['cutoff']) ** 4)
        lows = 1 + v['lows'] / np.sqrt(1 + (f / 90) ** 4)
        dc = np.where(f < 25, (f / 25) ** 2, 1.0)  # (no rumble below hearing)
        return (0.25 + resonances) * pipe * rolloff * lows * dc

    x = spectrum_filter(x, exhaust)
    # Diesel injector clatter: tiny sharp ticks, loudest at idle.
    if 'clatter' in v:
        f0, level = v['clatter']
        idle_k = np.clip(1 - (rpm - v['idle']) / (v['max'] - v['idle']), 0, 1)
        tick = np.sin(2 * np.pi * f0 * n) * np.exp(-n / 0.0006)
        tick2 = np.sin(2 * np.pi * f0 * 1.6 * n) * np.exp(-n / 0.0004)
        c = circular_convolve(clicks, tick + 0.6 * tick2)
        x = x / np.std(x) + level * (0.35 + 0.65 * idle_k) * c / (np.std(c) + 1e-9)
    # A turbo's whine, rising with the revs (a whole number of waves round the loop).
    if 'turbo' in v:
        f0, level = v['turbo']
        f = f0 * rpm / v['max']
        waves = max(1, round(f * N / FS))
        t = np.arange(N) / N
        x = x / np.std(x) + level * (0.3 + 0.7 * rpm / v['max']) * (np.sin(2 * np.pi * waves * t) + 0.3 * np.sin(2 * np.pi * 2 * waves * t)) * 3
    # Loudness: louder as it revs up, then a touch of soft saturation (warmth).
    x = x / (np.std(x) + 1e-9)
    loud = 0.16 * v['gain'] * (0.75 + 0.25 * (rpm - v['idle']) / (v['max'] - v['idle']))
    x = np.tanh(x * loud * 1.8) / 1.8
    return x, rpm


def save_mp3(x, path):
    data = (np.clip(np.tile(x, 2), -1, 1) * 32767).astype('<i2').tobytes()
    with tempfile.NamedTemporaryFile(suffix='.raw', delete=False) as tmp:
        tmp.write(data)
    try:
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 's16le', '-ar', str(FS), '-ac', '1', '-i', tmp.name,
                        '-c:a', 'libmp3lame', '-b:a', '80k', path], check=True)
    finally:
        os.unlink(tmp.name)


def main():
    os.makedirs(OUT, exist_ok=True)
    manifest = {'period': N / FS, 'voices': {}}
    for name, v in VOICES.items():
        rng = np.random.default_rng(sum(map(ord, name)) * 7919)  # (the same sounds every time)
        layers = []
        for i, want in enumerate(v['rpms']):
            x, rpm = render(v, want, rng)
            file = f'engine-{name}-{i}.mp3'
            save_mp3(x, os.path.join(OUT, file))
            layers.append({'file': file, 'rpm': round(rpm, 2)})
            print(f'{file}: {rpm:.0f} rpm, rms {np.sqrt(np.mean(x ** 2)):.3f}, peak {np.abs(x).max():.3f}, join {abs(x[0] - x[-1]):.4f}')
        manifest['voices'][name] = {'layers': layers, 'idle': v['idle'], 'max': v['max']}
    with open(os.path.join(OUT, 'engines.json'), 'w') as fp:
        json.dump(manifest, fp, indent=1)


if __name__ == '__main__':
    main()
