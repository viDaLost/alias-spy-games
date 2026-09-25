"""
Музыка для рекламного ролика на 28 секунд: тёплый поп-хаус 120 BPM, ровно
14 тактов, петлёй. Тот же инструментарий, что у 14-секундного ролика
(promo/ad/make_track.py), только гармония вдвое длиннее и акценты стоят на
перетеканиях из игры в игру. Написана здесь же, поэтому права на неё целиком у владельца
приложения — никаких чужих сэмплов и лицензий.

Гармония — фа мажор, по аккорду на такт: F · C · Dm · Bb · F · C · Dm · Bb ·
Gm · Bb · F · C · Bb · C и снова F в начале петли. Маримба играет восьмыми, под ней мягкий пэд и бас на
слабых восьмых; хлопки на 2 и 4. Акценты (аккорд с колокольчиком) стоят на
долях, где одна игра перетекает в другую, и на главных событиях сцен.

Всё считается по кругу: каждый звук кладётся в буфер длиной ровно в петлю,
хвост, вышедший за конец, дописывается в начало (реверберация — круговая
свёртка через FFT). Конец петли переходит в её начало без шва.

    python3 promo/ad-28/make_track.py  →  promo/ad-28/build/music.wav
"""
import os
import wave

import numpy as np

SR = 48000
BPM = 120
BEAT = 60 / BPM
BARS = 14
LENGTH = int(round(BARS * 4 * BEAT * SR))  # 1344000 отсчётов
rng = np.random.default_rng(23)
OUT = os.path.join(os.path.dirname(__file__), 'build')

# Доли (с нуля): перетекания из игры в игру и главные события сцен — см. README.
ACCENTS = {
    6: 0.8, 7: 0.55,            # ИОРДАН лёг в кроссворд, уровень пройден
    8: 0.45,                    # плитки слова → код комнаты
    15: 0.9, 16: 0.5,           # «Успешный запрос», карта Андрея → рыба
    18: 0.8, 19: 0.6, 20: 0.6,  # три «Библии», каскад, ковчег → Нил
    22: 0.7, 24: 0.8, 26: 0.7,  # волна, нырок, окно из колодца
    29: 0.7, 30: 0.8, 31: 0.6,  # кубики встали, грань «3» → карта, карта на сбросе
    34: 0.7, 36: 0.8, 40: 0.6,  # «Иордан», карта → холст, ковчег нарисован
    43: 0.8, 45: 0.8, 48: 1.0,  # «Художники победили», «Моисей», финал
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


def lowpass_sweep(x, cutoff):
    """Однополюсный НЧ-фильтр со срезом, меняющимся во времени."""
    k = np.exp(-2 * np.pi * np.asarray(cutoff) / SR) * np.ones(len(x))
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc = (1 - k[i]) * x[i] + k[i] * acc
        y[i] = acc
    return y


NOTE = {'C': 0, 'C#': 1, 'D': 2, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'Ab': 8, 'A': 9, 'Bb': 10, 'B': 11}


def hz(name, octave):
    return 440 * 2 ** ((NOTE[name] + 12 * (octave + 1) - 69) / 12)


# ——— ударные ———

def kick():
    n = int(0.42 * SR)
    t = np.arange(n) / SR
    freq = 50 + 105 * np.exp(-t / 0.03)
    body = np.sin(2 * np.pi * np.cumsum(freq) / SR) * np.exp(-t / 0.16)
    click = fft_filter(rng.standard_normal(n), lo=1200, hi=5000) * np.exp(-t / 0.002) * 0.25
    k = body + click
    return np.tanh(k * 1.5) / np.tanh(1.5)


def clap():
    n = int(0.4 * SR)
    t = np.arange(n) / SR
    noise = fft_filter(rng.standard_normal(n), lo=900, hi=4800)
    e = np.zeros(n)
    for off in (0.0, 0.009, 0.019):
        tt = t - off
        e += np.where(tt >= 0, np.exp(-np.maximum(tt, 0) / 0.008), 0) * 0.5
    e += np.where(t >= 0.026, np.exp(-(t - 0.026) / 0.13), 0) * 0.55
    return noise * e * 0.5


def shaker(decay=0.022, gain=1.0):
    n = int(0.12 * SR)
    t = np.arange(n) / SR
    noise = fft_filter(rng.standard_normal(n), lo=5500, hi=13000)
    return noise * env(n, 0.004, decay) * 0.3 * gain


# ——— тональная часть ———

def marimba(freq, length=0.5):
    """Деревянная пластина: основной тон и обертон около 3,9 f, быстро гаснущий."""
    n = int(length * SR)
    t = np.arange(n) / SR
    tone = np.sin(2 * np.pi * freq * t) * np.exp(-t / 0.2)
    tone += 0.32 * np.sin(2 * np.pi * freq * 3.93 * t) * np.exp(-t / 0.035)
    tone += 0.12 * np.sin(2 * np.pi * freq * 9.2 * t) * np.exp(-t / 0.012)
    return tone * np.clip(t / 0.0015, 0, 1)


def soft_saw(freq, n, detune=0.005):
    t = np.arange(n) / SR
    out = np.zeros(n)
    for d in (-detune, 0, detune):
        f = freq * (1 + d)
        k = 1
        while k * f < 7000 and k < 24:
            out += np.sin(2 * np.pi * f * k * t + d * 40) / k
            k += 1
    return out / 3


def pad(freqs, length):
    n = int(length * SR)
    x = sum(soft_saw(f, n) for f in freqs) / len(freqs)
    # снизу пэд подрезан: низ принадлежит бочке и басу, иначе он мутит удар
    x = fft_filter(fft_filter(x, lo=240), hi=1400, order=2)
    t = np.arange(n) / SR
    e = np.clip(t / 0.08, 0, 1) * np.clip((length - t) / 0.12, 0, 1)
    return x * e


def bass_note(freq, length):
    n = int(length * SR)
    t = np.arange(n) / SR
    sub = np.sin(2 * np.pi * freq * t)
    warm = np.tanh(2.2 * np.sin(2 * np.pi * freq * t)) * 0.35
    e = env(n, 0.006, length * 0.6) * np.clip((length - t) / 0.02, 0, 1)
    return (sub * 0.7 + warm) * e


def bell(freq, length=1.2):
    n = int(length * SR)
    t = np.arange(n) / SR
    tone = np.sin(2 * np.pi * freq * t) * np.exp(-t / 0.45)
    tone += 0.4 * np.sin(2 * np.pi * freq * 2.76 * t) * np.exp(-t / 0.12)
    tone += 0.18 * np.sin(2 * np.pi * freq * 5.4 * t) * np.exp(-t / 0.05)
    return tone * np.clip(t / 0.002, 0, 1) * 0.5


def hit(freqs):
    """Акцент: короткий яркий аккорд с раскрывающимся и тут же закрывающимся фильтром."""
    n = int(0.5 * SR)
    t = np.arange(n) / SR
    x = sum(soft_saw(f, n, 0.007) for f in freqs) / len(freqs)
    y = lowpass_sweep(x, 900 + 4200 * np.exp(-t / 0.06))
    return y * env(n, 0.002, 0.14)


# Аккорды (корень баса, голоса пэда, ноты арпеджио маримбы) и их порядок по тактам.
CH = {
    'F': ('F', [('F', 3), ('A', 3), ('C', 4), ('E', 4)], [('F', 4), ('A', 4), ('C', 5), ('A', 4), ('F', 5), ('C', 5), ('A', 4), ('C', 5)]),
    'C': ('C', [('E', 3), ('G', 3), ('C', 4), ('D', 4)], [('C', 5), ('E', 5), ('G', 4), ('E', 5), ('C', 5), ('G', 5), ('E', 5), ('D', 5)]),
    'Dm': ('D', [('F', 3), ('A', 3), ('D', 4), ('E', 4)], [('D', 5), ('F', 5), ('A', 4), ('F', 5), ('D', 5), ('A', 5), ('F', 5), ('E', 5)]),
    'Bb': ('Bb', [('F', 3), ('Bb', 3), ('D', 4), ('F', 4)], [('Bb', 4), ('D', 5), ('F', 5), ('D', 5), ('Bb', 4), ('F', 5), ('D', 5), ('C', 5)]),
    'Gm': ('G', [('G', 3), ('Bb', 3), ('D', 4), ('F', 4)], [('G', 4), ('Bb', 4), ('D', 5), ('Bb', 4), ('G', 5), ('D', 5), ('Bb', 4), ('D', 5)]),
    'Bb2': ('Bb', [('F', 3), ('Bb', 3), ('C', 4), ('F', 4)], [('Bb', 4), ('D', 5), ('F', 5), ('D', 5), ('C', 5), ('F', 5), ('G', 5), ('A', 5)]),
}
PROGRESSION = ['F', 'C', 'Dm', 'Bb', 'F', 'C', 'Dm', 'Bb', 'Gm', 'Bb', 'F', 'C', 'Bb', 'C']
CHORDS = [CH[name] for name in PROGRESSION]
assert len(CHORDS) == BARS


def reverb(x, seconds=1.6, mix=0.2):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    ir = fft_filter(rng.standard_normal(n), lo=300, hi=5500) * np.exp(-t / (seconds / 5))
    ir /= np.sqrt(np.sum(ir ** 2))
    padded = np.zeros(LENGTH)
    padded[:n] = ir
    wet = np.fft.irfft(np.fft.rfft(x) * np.fft.rfft(padded), LENGTH)
    return x * (1 - mix) + wet * mix


def main():
    os.makedirs(OUT, exist_ok=True)
    drums = np.zeros(LENGTH)
    tonal = np.zeros(LENGTH)
    keys = np.zeros(LENGTH)

    k, c = kick(), clap()
    for beat in range(BARS * 4):
        place(drums, k, beat, 0.78)
        if beat % 4 in (1, 3):
            place(drums, c, beat, 2.2)
        place(drums, shaker(0.03), beat + 0.5, 1.9)
        place(drums, shaker(0.016, 0.5), beat + 0.25, 1.6)
        place(drums, shaker(0.016, 0.45), beat + 0.75, 1.6)
    # заход в петлю: дробь шейкера на последней доле
    for s in range(4):
        place(drums, shaker(0.014, 0.6 + 0.15 * s), BARS * 4 - 1 + s * 0.25, 1.8)

    for bar, (root, voices, arp) in enumerate(CHORDS):
        base = bar * 4
        rf = hz(root, 2)
        if rf > 110:
            rf /= 2
        # бас: на «и» каждой доли и гаснет до следующего удара; в конце такта —
        # подход к следующему корню
        for off in (0.5, 1.5, 2.5, 3.5):
            place(tonal, bass_note(rf, 0.22), base + off, 0.55)
        place(tonal, bass_note(rf * 2 ** (7 / 12), 0.16), base + 3.75, 0.36)
        place(tonal, pad([hz(n, o) for n, o in voices], 4 * BEAT), base, 0.55)
        # маримба восьмыми; в последнем такте верх поднимается к началу петли
        for i, (n, o) in enumerate(arp):
            place(keys, marimba(hz(n, o)), base + i * 0.5, 0.36 if i % 2 == 0 else 0.26)

    freqs_of = lambda bar: [hz(n, o + 1) for n, o in CHORDS[bar][1]]
    for beat, amount in ACCENTS.items():
        bar = beat // 4
        place(tonal, hit(freqs_of(bar)), beat, 1.3 * amount)
        top = hz(CHORDS[bar][2][0][0], 6)
        place(keys, bell(top), beat, 0.34 * amount)

    # «дыхание» под бочку
    t = np.arange(LENGTH) / SR
    duck = 1 - 0.5 * np.exp(-np.mod(t, BEAT) / 0.1)
    tonal = reverb(tonal * duck, 1.8, 0.2)
    keys = reverb(keys * (0.4 + 0.6 * duck), 1.4, 0.26)
    drums = reverb(drums, 0.8, 0.06)

    mono = drums * 0.95 + tonal + keys
    width = np.roll(keys * 0.22 + tonal * 0.05, int(0.013 * SR))
    stereo = np.stack([mono + width, mono - width], axis=1)
    stereo = np.tanh(stereo * 1.1)
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
