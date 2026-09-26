"""
Музыка для минутного ролика «Библейские игры»: тёплый эмбиент-поп 100 BPM,
ровно 26 тактов, петлёй. Написана здесь же — права на неё целиком у владельца
приложения, никаких чужих сэмплов.

Спокойнее прошлых треков (promo/ad, promo/ad-28 — маримба и поп-хаус 120 BPM):
фортепиано ломаными аккордами восьмыми, под ним широкий пэд с медленной атакой,
мягкий щипковый бас на каждую долю, мягкая бочка, щелчок на 2 и 4 и тихий шейкер.
Колокольчик и раскрывающийся аккорд стоят на долях, где одна игра перетекает в
другую, и на главных событиях сцен.

Гармония — ре мажор, по аккорду на такт:
D A Bm G · D A Bm G · Em G D A · Bm G D A · D A Bm G · Em G D A · G A
и снова D в начале петли.

Всё считается по кругу: каждый звук кладётся в буфер длиной ровно в петлю,
хвост за концом дописывается в начало (реверберация — круговая свёртка через
FFT). Конец петли переходит в её начало без шва.

    python3 promo/ad-60/make_track.py  →  promo/ad-60/build/music.wav
"""
import os
import wave

import numpy as np

SR = 48000
BPM = 100
BEAT = 60 / BPM
BARS = 26
LENGTH = int(round(BARS * 4 * BEAT * SR))  # 2995200 отсчётов, 62,4 с
rng = np.random.default_rng(41)
OUT = os.path.join(os.path.dirname(__file__), 'build')

# Доли (с нуля): перетекания и главные события сцен — см. README.
ACCENTS = {
    6: 0.7, 7: 0.5, 8: 0.5,            # ИОРДАН в кроссворде, уровень пройден, плитки → поиск
    12: 0.7, 18: 0.8, 21: 0.6,         # АВРААМ найден, НОЙ открыт, «Н» → буква раунда
    23: 0.5, 25: 0.6, 32: 0.6,         # новый раунд, переворот к «Алиасу», куб к «Опиши»
    33: 0.6, 36: 0.5, 38: 0.8,         # «радуга», телефон дальше, «Вы — соглядатай»
    42: 0.6, 46: 0.6,                  # локация, окно в лобби «Квартета»
    55: 0.9, 56: 0.5, 58: 0.8, 59: 0.6,  # «Успешный запрос», Андрей → рыба, «Библии», каскад
    60: 0.5, 62: 0.6, 64: 0.7, 67: 0.6,  # ковчег → карточка, пара, вторая пара, Нил
    70: 0.7, 72: 0.8, 74: 0.7,         # волна, нырок, колодец
    77: 0.7, 78: 0.8, 79: 0.6,         # кубики, грань «3» → карта, карта на сбросе
    82: 0.7, 84: 0.8, 88: 0.6,         # «Иордан», карта → холст, ковчег нарисован
    91: 0.8, 93: 0.8, 96: 1.0,         # «Художники победили», «Моисей», финал
}


def at(beat):
    return int(round(beat * BEAT * SR))


def place(buf, sound, beat, gain=1.0):
    """Положить звук с доли beat, хвост за концом петли уходит в её начало."""
    start = at(beat) % LENGTH
    idx = (start + np.arange(len(sound))) % LENGTH
    np.add.at(buf, idx, sound * gain)


def env(n, attack, decay):
    t = np.arange(n) / SR
    return np.clip(t / max(attack, 1e-4), 0, 1) * np.exp(-t / decay)


def fft_filter(x, lo=None, hi=None, order=4):
    spec = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    mask = np.ones_like(f)
    if lo:
        mask *= 1 / (1 + (lo / np.maximum(f, 1)) ** order)
    if hi:
        mask *= 1 / (1 + (f / hi) ** order)
    return np.fft.irfft(spec * mask, len(x))


NOTE = {'C': 0, 'C#': 1, 'D': 2, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'Ab': 8, 'A': 9, 'Bb': 10, 'B': 11}


def hz(name, octave):
    return 440 * 2 ** ((NOTE[name] + 12 * (octave + 1) - 69) / 12)


# ——— ударные: мягко, чтобы не спорить с пэдом ———

def kick():
    n = int(0.5 * SR)
    t = np.arange(n) / SR
    freq = 46 + 70 * np.exp(-t / 0.035)
    body = np.sin(2 * np.pi * np.cumsum(freq) / SR) * np.exp(-t / 0.2)
    click = fft_filter(rng.standard_normal(n), lo=900, hi=3500) * np.exp(-t / 0.0025) * 0.12
    return np.tanh((body + click) * 1.2) / np.tanh(1.2)


def snap():
    """Щелчок пальцами/римшот: короткий шум и деревянный тон."""
    n = int(0.3 * SR)
    t = np.arange(n) / SR
    noise = fft_filter(rng.standard_normal(n), lo=1500, hi=6500) * env(n, 0.0008, 0.018)
    wood = np.sin(2 * np.pi * 820 * t) * env(n, 0.0005, 0.012) * 0.5
    tail = fft_filter(rng.standard_normal(n), lo=1200, hi=5000) * env(n, 0.01, 0.09) * 0.18
    return (noise * 0.7 + wood + tail) * 0.55


def shaker(decay=0.02, gain=1.0):
    n = int(0.12 * SR)
    noise = fft_filter(rng.standard_normal(n), lo=6000, hi=12500)
    return noise * env(n, 0.006, decay) * 0.22 * gain


# ——— тональная часть ———

def piano(freq, length=1.6, bright=1.0):
    """Фортепиано: несколько чуть расстроенных гармоник, верхние гаснут быстрее, мягкий молоточек."""
    n = int(length * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for k, (amp, tau) in enumerate([(1.0, 1.1), (0.45, 0.6), (0.22, 0.35), (0.12, 0.2), (0.06, 0.12)], start=1):
        f = freq * k * (1 + 0.0004 * k * k)          # лёгкая неравномерность струны
        out += amp * (bright if k > 2 else 1) * np.sin(2 * np.pi * f * t) * np.exp(-t / tau)
    hammer = fft_filter(rng.standard_normal(n), lo=800, hi=4000) * env(n, 0.0005, 0.006) * 0.05
    return (out + hammer) * np.clip(t / 0.003, 0, 1) * np.clip((length - t) / 0.08, 0, 1)


def warm_saw(freq, n, detune=0.004):
    t = np.arange(n) / SR
    out = np.zeros(n)
    for d in (-detune, 0, detune):
        f = freq * (1 + d)
        k = 1
        while k * f < 5000 and k < 18:
            out += np.sin(2 * np.pi * f * k * t + d * 60) / (k ** 1.3)
            k += 1
    return out / 3


def pad(freqs, length):
    n = int(length * SR)
    x = sum(warm_saw(f, n) for f in freqs) / len(freqs)
    x = fft_filter(fft_filter(x, lo=200), hi=1100, order=2)
    t = np.arange(n) / SR
    # медленная атака и длинный спад — аккорды перетекают друг в друга
    e = np.clip(t / 0.6, 0, 1) * np.clip((length - t) / 0.5, 0, 1)
    return x * e


def bass_note(freq, length):
    """Мягкий щипковый бас: гаснет к концу доли, чтобы удар бочки открывал каждую долю."""
    n = int(length * SR)
    t = np.arange(n) / SR
    sub = np.sin(2 * np.pi * freq * t)
    warm = np.sin(2 * np.pi * freq * 2 * t) * 0.22
    e = np.clip(t / 0.012, 0, 1) * np.exp(-t / 0.2) * np.clip((length - t) / 0.04, 0, 1)
    return (sub + warm) * e


def bell(freq, length=2.2):
    """Колокольчик-челеста: чистый тон и негармоничный обертон."""
    n = int(length * SR)
    t = np.arange(n) / SR
    tone = np.sin(2 * np.pi * freq * t) * np.exp(-t / 0.8)
    tone += 0.3 * np.sin(2 * np.pi * freq * 3.01 * t) * np.exp(-t / 0.25)
    tone += 0.12 * np.sin(2 * np.pi * freq * 4.2 * t) * np.exp(-t / 0.08)
    return tone * np.clip(t / 0.002, 0, 1) * 0.45


def bloom(freqs):
    """Акцент: аккорд, который мягко раскрывается и гаснет — вместо резкого удара."""
    n = int(1.4 * SR)
    t = np.arange(n) / SR
    x = sum(warm_saw(f, n, 0.006) for f in freqs) / len(freqs)
    x = fft_filter(x, lo=250, hi=2600, order=2)
    return x * np.clip(t / 0.04, 0, 1) * np.exp(-t / 0.45)


# Аккорды: корень баса, голоса пэда, ноты фортепиано (ломаный аккорд восьмыми).
CH = {
    'D':  ('D', [('F#', 3), ('A', 3), ('D', 4), ('E', 4)], [('D', 4), ('A', 4), ('F#', 4), ('A', 4), ('D', 5), ('A', 4), ('F#', 4), ('E', 4)]),
    'A':  ('A', [('E', 3), ('A', 3), ('C#', 4), ('E', 4)], [('A', 3), ('E', 4), ('C#', 4), ('E', 4), ('A', 4), ('E', 4), ('C#', 4), ('B', 3)]),
    'Bm': ('B', [('F#', 3), ('B', 3), ('D', 4), ('F#', 4)], [('B', 3), ('F#', 4), ('D', 4), ('F#', 4), ('B', 4), ('F#', 4), ('D', 4), ('C#', 4)]),
    'G':  ('G', [('G', 3), ('B', 3), ('D', 4), ('F#', 4)], [('G', 3), ('D', 4), ('B', 3), ('D', 4), ('G', 4), ('D', 4), ('B', 3), ('A', 3)]),
    'Em': ('E', [('G', 3), ('B', 3), ('E', 4), ('F#', 4)], [('E', 4), ('B', 4), ('G', 4), ('B', 4), ('E', 5), ('B', 4), ('G', 4), ('F#', 4)]),
}
PROGRESSION = ['D', 'A', 'Bm', 'G', 'D', 'A', 'Bm', 'G', 'Em', 'G', 'D', 'A', 'Bm', 'G', 'D', 'A',
               'D', 'A', 'Bm', 'G', 'Em', 'G', 'D', 'A', 'G', 'A']
CHORDS = [CH[name] for name in PROGRESSION]
assert len(CHORDS) == BARS
# Мелодия фортепиано сверху — по такту через один, простая, чтобы не мешать звукам интерфейса.
MELODY = {
    1: [(0, 'E', 5, 1.5), (1.5, 'C#', 5, 0.5), (2, 'A', 4, 2)],
    3: [(0, 'D', 5, 1), (1, 'B', 4, 1), (2, 'A', 4, 2)],
    5: [(0, 'E', 5, 1.5), (1.5, 'F#', 5, 0.5), (2, 'E', 5, 2)],
    7: [(0, 'D', 5, 1), (1, 'B', 4, 1), (2, 'D', 5, 2)],
    9: [(0, 'B', 4, 1), (1, 'D', 5, 1), (2, 'G', 5, 2)],
    11: [(0, 'E', 5, 1.5), (1.5, 'D', 5, 0.5), (2, 'C#', 5, 2)],
    13: [(0, 'D', 5, 1), (1, 'B', 4, 1), (2, 'G', 4, 2)],
    15: [(0, 'A', 4, 1), (1, 'C#', 5, 1), (2, 'E', 5, 2)],
    17: [(0, 'E', 5, 1.5), (1.5, 'C#', 5, 0.5), (2, 'A', 4, 2)],
    19: [(0, 'D', 5, 1), (1, 'B', 4, 1), (2, 'A', 4, 2)],
    21: [(0, 'B', 4, 1), (1, 'D', 5, 1), (2, 'G', 5, 2)],
    23: [(0, 'E', 5, 1.5), (1.5, 'D', 5, 0.5), (2, 'C#', 5, 2)],
    25: [(0, 'C#', 5, 1), (1, 'E', 5, 1), (2, 'F#', 5, 2)],
}


def reverb(x, seconds=2.6, mix=0.3):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    ir = fft_filter(rng.standard_normal(n), lo=250, hi=4800) * np.exp(-t / (seconds / 5))
    ir /= np.sqrt(np.sum(ir ** 2))
    padded = np.zeros(LENGTH)
    padded[:n] = ir
    wet = np.fft.irfft(np.fft.rfft(x) * np.fft.rfft(padded), LENGTH)
    return x * (1 - mix) + wet * mix


def main():
    os.makedirs(OUT, exist_ok=True)
    drums = np.zeros(LENGTH)
    low = np.zeros(LENGTH)
    keys = np.zeros(LENGTH)
    air = np.zeros(LENGTH)

    k, s = kick(), snap()
    for beat in range(BARS * 4):
        place(drums, k, beat, 0.72)
        if beat % 4 in (1, 3):
            place(drums, s, beat, 1.5)
        place(drums, shaker(0.028), beat + 0.5, 1.4)
        place(drums, shaker(0.014, 0.45), beat + 0.25, 1.1)
        place(drums, shaker(0.014, 0.4), beat + 0.75, 1.1)
    # заход в петлю: шейкер шестнадцатыми на последней доле
    for i in range(4):
        place(drums, shaker(0.014, 0.5 + 0.12 * i), BARS * 4 - 1 + i * 0.25, 1.4)

    for bar, (root, voices, arp) in enumerate(CHORDS):
        base = bar * 4
        rf = hz(root, 2)
        if rf > 98:
            rf /= 2
        for off, gain in ((0, 0.7), (1, 0.45), (2, 0.6), (3, 0.42)):
            place(low, bass_note(rf, BEAT * 0.92), base + off, gain)
        place(low, bass_note(rf * 2 ** (7 / 12), 0.25 * BEAT), base + 3.5, 0.28)
        place(air, pad([hz(n, o) for n, o in voices], 4 * BEAT + 0.6), base - 0.25, 0.5)
        for i, (n, o) in enumerate(arp):
            place(keys, piano(hz(n, o), 1.4, 0.8), base + i * 0.5, 0.2 if i % 2 == 0 else 0.13)
        for off, n, o, dur in MELODY.get(bar, []):
            place(keys, piano(hz(n, o), dur * BEAT + 1.2, 1.1), base + off, 0.3)

    freqs_of = lambda bar: [hz(n, o + 1) for n, o in CHORDS[bar][1]]
    for beat, amount in ACCENTS.items():
        bar = beat // 4
        place(air, bloom(freqs_of(bar)), beat, 0.9 * amount)
        top = hz(CHORDS[bar][2][0][0], 6)
        place(keys, bell(top), beat, 0.3 * amount)

    # лёгкое «дыхание» под бочку — слабее, чем в поп-хаусе
    t = np.arange(LENGTH) / SR
    duck = 1 - 0.28 * np.exp(-np.mod(t, BEAT) / 0.14)
    low = reverb(low * duck, 1.2, 0.08)
    air = reverb(air * duck, 3.2, 0.4)
    keys = reverb(keys, 2.4, 0.3)
    drums = reverb(drums, 1.0, 0.1)

    mono = drums * 0.9 + low + air + keys
    width = np.roll(keys * 0.25 + air * 0.18, int(0.017 * SR))
    stereo = np.stack([mono + width, mono - width], axis=1)
    stereo = np.tanh(stereo * 1.05)
    stereo *= 0.89 / np.max(np.abs(stereo))
    pcm = (np.clip(stereo, -1, 1) * 32767).astype('<i2')
    with wave.open(os.path.join(OUT, 'music.wav'), 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print(f'music.wav: {LENGTH / SR:.2f} s, {BARS} bars @ {BPM} BPM')


if __name__ == '__main__':
    main()
