"""
Звуки интерфейса и сведение с музыкой.

События берутся из самого ролика (build/sounds.json — их отдаёт страница),
сетка — из анализа трека (build/beats.json). Каждый звук ставится так, чтобы
его собственный пик пришёлся на измеренный пик удара своей доли (для дробных
долей — плюс доля периода). Всё по кругу: петля звучит без шва, как и видна.

Кадр 0 видео — первая доля трека, поэтому музыка сдвигается по кругу на её
измеренное время.

    python3 promo/ad/mix_audio.py  →  build/final.wav
"""
import json
import os
import wave

import numpy as np

HERE = os.path.dirname(__file__)
BUILD = os.path.join(HERE, 'build')
rng = np.random.default_rng(11)

with wave.open(os.path.join(BUILD, 'music.wav')) as w:
    SR = w.getframerate()
    music = np.frombuffer(w.readframes(w.getnframes()), dtype='<i2').reshape(-1, 2).astype(np.float64) / 32768
grid = json.load(open(os.path.join(BUILD, 'beats.json')))
events = json.load(open(os.path.join(BUILD, 'sounds.json')))
N = len(music)


def band_noise(n, lo, hi):
    spec = np.fft.rfft(rng.standard_normal(n))
    f = np.fft.rfftfreq(n, 1 / SR)
    spec *= 1 / (1 + (lo / np.maximum(f, 1)) ** 4) / (1 + (f / hi) ** 4)
    x = np.fft.irfft(spec, n)
    return x / (np.abs(x).max() + 1e-12)


def decay(n, tau, attack=0.0005):
    t = np.arange(n) / SR
    return np.clip(t / attack, 0, 1) * np.exp(-t / tau)


def tone(freq, n, tau, attack=0.002):
    t = np.arange(n) / SR
    return np.sin(2 * np.pi * freq * t) * decay(n, tau, attack)


def sweep(f0, f1, n, tau):
    t = np.arange(n) / SR
    f = f1 + (f0 - f1) * np.exp(-t / 0.012)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * decay(n, tau, 0.001)


def sound(kind):
    n = int(0.5 * SR)
    if kind == 'click':
        s = band_noise(n, 2500, 7000) * decay(n, 0.0028) * 0.9 + sweep(420, 180, n, 0.014) * 0.5
    elif kind == 'release':
        s = band_noise(n, 3500, 9000) * decay(n, 0.0018) * 0.45
    elif kind == 'grab':
        s = band_noise(n, 1800, 6000) * decay(n, 0.003) * 0.7 + sweep(300, 140, n, 0.018) * 0.45
    elif kind == 'drop':
        s = band_noise(n, 3000, 8000) * decay(n, 0.002) * 0.5 + sweep(520, 300, n, 0.01) * 0.25
    elif kind == 'toggle':
        a = band_noise(n, 2500, 8000) * decay(n, 0.0022) * 0.75
        s = a + np.roll(a, int(0.028 * SR)) * 0.55 + sweep(380, 200, n, 0.012) * 0.35
    elif kind == 'pop':
        s = sweep(1250, 780, n, 0.03) * 0.42
    elif kind == 'tick':
        s = band_noise(n, 4000, 11000) * decay(n, 0.0015) * 0.35
    elif kind == 'key':
        s = band_noise(n, 1200, 5000) * decay(n, 0.006) * 0.55 + sweep(260, 120, n, 0.02) * 0.4
    elif kind == 'enter':
        s = band_noise(n, 900, 4000) * decay(n, 0.009) * 0.6 + sweep(200, 90, n, 0.035) * 0.6
    elif kind == 'success':
        # две ноты из тональности трека (фа мажор): до и фа выше — мягко, без звона
        s = tone(1046.5, n, 0.16) * 0.26 + np.roll(tone(1396.9, n, 0.22), int(0.075 * SR)) * 0.22
    else:
        raise ValueError(kind)
    return s


# Время пика удара для дробной доли: пик целой доли + доля периода.
peaks = np.array(grid['peaks'])
period = grid['period']
first = grid['beats'][0]


def target(beat):
    i = int(np.floor(beat + 1e-9)) % 28
    return peaks[i] + (beat - np.floor(beat + 1e-9)) * period


ui = np.zeros(N)
placed = []
for ev in events:
    s = sound(ev['kind'])
    peak = int(np.argmax(np.abs(s)))
    at = int(round((target(ev['beat']) - first) * SR)) - peak
    idx = (at + np.arange(len(s))) % N
    np.add.at(ui, idx, s)
    placed.append((ev['beat'], ev['kind'], round((at + peak) / SR, 4)))

# Музыка по кругу: кадр 0 — первая доля.
shift = int(round(first * SR))
mus = np.roll(music, -shift, axis=0)
level_ui = 0.42
mix = mus + level_ui * ui[:, None]
mix = np.tanh(mix * 1.05) / np.tanh(1.05)
mix *= 0.891 / np.abs(mix).max()  # −1 дБFS

pcm = (np.clip(mix, -1, 1) * 32767).astype('<i2')
with wave.open(os.path.join(BUILD, 'final.wav'), 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(f'final.wav: {N / SR:.2f} s, {len(placed)} UI-звуков')
for b, k, t in placed:
    print(f'  доля {b:6.2f}  {k:8s} пик в {t:.4f} с')
