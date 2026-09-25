"""
Музыка для ролика: минимал-хаус 120 BPM, ровно 7 тактов (14 с), петлёй.

Всё считается по кругу: каждый звук кладётся в буфер длиной ровно в петлю, и
хвост, вышедший за конец, дописывается в начало (как и реверберация —
свёртка через FFT здесь сама по себе круговая). Поэтому конец петли
переходит в её начало без шва: на повторе слышно то же, что в середине.

    python3 promo/ui-motion/make_track.py  →  promo/ui-motion/build/music.wav
"""
import os
import wave

import numpy as np

SR = 48000
BPM = 120
BEAT = 60 / BPM
BARS = 7
LENGTH = int(round(BARS * 4 * BEAT * SR))  # 672000 отсчётов
rng = np.random.default_rng(7)
OUT = os.path.join(os.path.dirname(__file__), 'build')


def at(beat):
    """Номер отсчёта для доли (0 — первая доля первого такта)."""
    return int(round(beat * BEAT * SR))


def place(buf, sound, beat, gain=1.0):
    """Положить звук с доли beat, с переходом хвоста в начало петли."""
    start = at(beat) % LENGTH
    idx = (start + np.arange(len(sound))) % LENGTH
    np.add.at(buf, idx, sound * gain)


def env(n, attack, decay):
    t = np.arange(n) / SR
    a = np.clip(t / max(attack, 1e-4), 0, 1)
    return a * np.exp(-t / decay)


def onepole_lp(x, cutoff):
    """Простой однополюсный фильтр нижних частот (по кругу не нужен — короткие звуки)."""
    k = np.exp(-2 * np.pi * cutoff / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc = (1 - k) * v + k * acc
        y[i] = acc
    return y


def fft_filter(x, lo=None, hi=None):
    """Полосовой фильтр в частотной области — для шумовых звуков."""
    spec = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    mask = np.ones_like(f)
    if lo:
        mask *= 1 / (1 + (lo / np.maximum(f, 1)) ** 4)
    if hi:
        mask *= 1 / (1 + (f / hi) ** 4)
    return np.fft.irfft(spec * mask, len(x))


# ——— ударные ———

def kick():
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    freq = 46 + 115 * np.exp(-t / 0.028)
    phase = 2 * np.pi * np.cumsum(freq) / SR
    body = np.sin(phase) * np.exp(-t / 0.17)
    click = fft_filter(rng.standard_normal(n), lo=1500, hi=7000) * np.exp(-t / 0.0025) * 0.35
    k = body + click
    return np.tanh(k * 1.6) / np.tanh(1.6)


def clap():
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    noise = fft_filter(rng.standard_normal(n), lo=650, hi=5200)
    e = np.zeros(n)
    for off in (0.0, 0.011, 0.022):
        tt = t - off
        e += np.where(tt >= 0, np.exp(-np.maximum(tt, 0) / 0.009), 0) * 0.55
    e += np.where(t >= 0.03, np.exp(-(t - 0.03) / 0.11), 0) * 0.6
    return noise * e * 0.5


def hat(decay=0.028, gain=1.0):
    n = int(max(0.08, decay * 8) * SR)
    t = np.arange(n) / SR
    noise = fft_filter(rng.standard_normal(n), lo=7000, hi=15000)
    return noise * np.exp(-t / decay) * 0.35 * gain


# ——— тональная часть ———

NOTE = {'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11}


def hz(name, octave):
    return 440 * 2 ** ((NOTE[name] + 12 * (octave + 1) - 69) / 12)


def saw(freq, n, detune=0.0):
    t = np.arange(n) / SR
    out = np.zeros(n)
    for d in (-detune, 0, detune):
        f = freq * (1 + d)
        # полосно-ограниченная пила из гармоник (до 12 кГц)
        k = 1
        while k * f < 12000 and k < 40:
            out += np.sin(2 * np.pi * f * k * t) / k
            k += 1
    return out * (2 / np.pi) / 3


def bass_note(freq, length):
    n = int(length * SR)
    t = np.arange(n) / SR
    sub = np.sin(2 * np.pi * freq * t)
    grit = onepole_lp(saw(freq, n), 750)
    e = env(n, 0.004, length * 0.55)
    tail = np.clip((length - t) / 0.02, 0, 1)
    return (sub * 0.5 + grit * 0.7) * e * tail


def stab(freqs, length=0.34):
    n = int(length * SR)
    t = np.arange(n) / SR
    x = sum(saw(f, n, detune=0.004) for f in freqs) / len(freqs)
    cutoff = 1100 + 3200 * np.exp(-t / 0.07)
    # фильтр с меняющимся срезом — по кускам
    y = np.zeros(n)
    acc = 0.0
    for i in range(n):
        k = np.exp(-2 * np.pi * cutoff[i] / SR)
        acc = (1 - k) * x[i] + k * acc
        y[i] = acc
    return y * env(n, 0.003, 0.11)


def bell(freq, length=0.6):
    n = int(length * SR)
    t = np.arange(n) / SR
    tone = np.sin(2 * np.pi * freq * t) + 0.35 * np.sin(2 * np.pi * freq * 2.01 * t) * np.exp(-t / 0.08)
    return tone * env(n, 0.002, 0.22) * 0.5


# Гармония по тактам: Dm7 · Dm7 · Bbmaj7 · C · Dm7 · Bbmaj7 · C (и снова Dm7 — начало петли).
CHORDS = [
    ('D', [('D', 4), ('F', 4), ('A', 4), ('C', 5)]),
    ('D', [('D', 4), ('F', 4), ('A', 4), ('C', 5)]),
    ('Bb', [('Bb', 3), ('D', 4), ('F', 4), ('A', 4)]),
    ('C', [('C', 4), ('E', 4), ('G', 4), ('C', 5)]),
    ('D', [('D', 4), ('F', 4), ('A', 4), ('C', 5)]),
    ('Bb', [('Bb', 3), ('D', 4), ('F', 4), ('A', 4)]),
    ('C', [('C', 4), ('E', 4), ('G', 4), ('Bb', 4)]),
]


def reverb(x, seconds=1.4, mix=0.18):
    """Круговая свёртка с синтетическим залом — хвост петли уходит в её начало."""
    n = int(seconds * SR)
    t = np.arange(n) / SR
    ir = fft_filter(rng.standard_normal(n), lo=250, hi=6000) * np.exp(-t / (seconds / 5))
    ir /= np.sqrt(np.sum(ir ** 2))
    pad = np.zeros(LENGTH)
    pad[:n] = ir
    wet = np.fft.irfft(np.fft.rfft(x) * np.fft.rfft(pad), LENGTH)
    return x * (1 - mix) + wet * mix


def main():
    os.makedirs(OUT, exist_ok=True)
    drums = np.zeros(LENGTH)
    tonal = np.zeros(LENGTH)
    kicks = []

    k, c = kick(), clap()
    for beat in range(BARS * 4):
        place(drums, k, beat, 0.72)
        kicks.append(beat)
        if beat % 4 in (1, 3):
            place(drums, c, beat, 2.6)
        # хай-хэт на каждую вторую восьмую, тихие шестнадцатые между ними
        place(drums, hat(0.03), beat + 0.5, 2.2)
        place(drums, hat(0.018, 0.45), beat + 0.25, 2.0)
        place(drums, hat(0.018, 0.4), beat + 0.75, 2.0)
        # открытый хэт с третьего такта — чуть плотнее к середине
        if beat >= 8 and beat % 2 == 1:
            place(drums, hat(0.09, 0.5), beat + 0.5, 1.8)
    # заход в петлю: дробь хэтов в последней доле
    for s in range(4):
        place(drums, hat(0.015, 0.5 + 0.12 * s), 27 + s * 0.25, 2.0)

    for bar, (root, chord) in enumerate(CHORDS):
        base = bar * 4
        # бас: офбиты, как в минимал-хаусе, с подходом в конце такта
        rf = hz(root, 1 if root in ('D', 'C') else 1)
        for off in (0.5, 1.5, 2.5, 3.5):
            place(tonal, bass_note(rf, 0.36), base + off, 0.42)
        place(tonal, bass_note(rf * 2 ** (7 / 12), 0.18), base + 3.75, 0.35)
        # аккордовые уколы: «и» второй доли и «и» четвёртой
        freqs = [hz(n, o) for n, o in chord]
        place(tonal, stab(freqs), base + 1.5, 2.3)
        place(tonal, stab(freqs, 0.22), base + 3.25, 1.6)
        # колокольчик-мотив в тактах 3–6: немного воздуха над ритмом
        if 2 <= bar <= 5:
            top = freqs[-1] * 2
            for i, off in enumerate((0.0, 0.75, 2.0, 2.75)):
                place(tonal, bell(top * (1, 2 ** (-3 / 12), 2 ** (-5 / 12), 2 ** (-3 / 12))[i]), base + off, 0.3)

    # «дыхание» под бочку: всё тональное приседает на каждой доле
    t = np.arange(LENGTH) / SR
    since = np.mod(t, BEAT)
    duck = 1 - 0.55 * np.exp(-since / 0.11)
    tonal = reverb(tonal * duck, 1.6, 0.22)
    drums = reverb(drums, 0.9, 0.07)

    mix = drums * 0.9 + tonal
    mix = np.tanh(mix * 1.15)
    mix *= 0.89 / np.max(np.abs(mix))

    # стерео: ударные по центру, лёгкое расширение тональной части задержкой
    width = np.roll(tonal * 0.06, int(0.011 * SR))
    left = np.clip(mix + width, -1, 1)
    right = np.clip(mix - width, -1, 1)
    stereo = np.stack([left, right], axis=1)
    pcm = (stereo * 32767).astype('<i2')
    with wave.open(os.path.join(OUT, 'music.wav'), 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print(f'music.wav: {LENGTH / SR:.2f} s, {BARS} bars @ {BPM} BPM')


if __name__ == '__main__':
    main()
