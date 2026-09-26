"""
Музыка под голос обучающего ролика «Царства»: тёплый эмбиент без ударных.

Ре минор с оттенком дорийского: Dm – B♭ – C – Am по восемь секунд, как
медленное дыхание. Слои:
  * бурдон — низкое ре и его квинта, всё время, едва слышно;
  * пэд — аккорд из мягких «пил» (сумма первых гармоник) под фильтром, с
    долгой атакой: аккорды перетекают друг в друга без швов;
  * щипки — струна вроде кинора (арфы Давида): затухающие гармоники,
    редкий узор по нотам аккорда, чуть неровный по силе — живой;
  * зал — искусственный хвост около 2,5 с.
Всё считается числом, сеть не нужна. Длина — по голосу (shots/narration.js).

    python3 promo/kingdoms-tutorial/make_music.py  →  build/music.wav (48 кГц, стерео)
"""
import json
import os
import re
import wave

import numpy as np
from scipy import signal

HERE = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.join(HERE, 'build')
SR = 48000
rng = np.random.default_rng(1207)

narration = json.loads(re.sub(r'^window\.NARRATION = |;\s*$', '', open(os.path.join(HERE, 'shots', 'narration.js'), encoding='utf-8').read()))
DUR = narration['duration']
N = int(DUR * SR) + SR

def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)

# аккорды: ноты MIDI (бас отдельно)
D, F, A, Bb, C, E, G = 62, 65, 69, 58, 60, 64, 67
CHORDS = [
    {'bass': 38, 'pad': [D, F, A, 74], 'pluck': [62, 65, 69, 72, 74, 77]},        # Dm (add9-ish)
    {'bass': 34, 'pad': [Bb, D, F, 72], 'pluck': [58, 62, 65, 69, 70, 74]},       # B♭maj7
    {'bass': 36, 'pad': [C, E, G, 74], 'pluck': [60, 64, 67, 71, 72, 76]},        # C(add9)
    {'bass': 33, 'pad': [57, 60, 64, 71], 'pluck': [57, 60, 64, 67, 69, 72]},     # Am7
]
BAR = 8.0

def soft_saw(freq, n, harmonics=10, detune=0.0):
    t = np.arange(n) / SR
    out = np.zeros(n)
    for k in range(1, harmonics + 1):
        if freq * k > 9000:
            break
        out += np.sin(2 * np.pi * freq * (1 + detune) * k * t + rng.uniform(0, 2 * np.pi)) / k ** 1.35
    return out

def envelope(n, attack, release):
    e = np.ones(n)
    a = int(attack * SR); r = int(release * SR)
    e[:a] = np.sin(np.linspace(0, np.pi / 2, a)) ** 2
    e[-r:] *= np.cos(np.linspace(0, np.pi / 2, r)) ** 2
    return e

L = np.zeros(N); R = np.zeros(N)

def put(x, at, pan=0.0, gain=1.0):
    i = int(at * SR)
    if i >= N:
        return
    x = x[:N - i] * gain
    L[i:i + len(x)] += x * np.cos((pan + 1) * np.pi / 4)
    R[i:i + len(x)] += x * np.sin((pan + 1) * np.pi / 4)

# ——— бурдон ———
t = np.arange(N) / SR
drone = (np.sin(2 * np.pi * hz(38) * t) * 0.6 + np.sin(2 * np.pi * hz(45) * t) * 0.25 + np.sin(2 * np.pi * hz(50) * t) * 0.12)
drone *= 0.85 + 0.15 * np.sin(2 * np.pi * t / 23.0)
L += drone * 0.055; R += drone * 0.055

# ——— пэд и бас по аккордам ———
bars = int(np.ceil(DUR / BAR)) + 1
for b in range(bars):
    ch = CHORDS[b % 4]
    start = b * BAR - 1.5
    n = int((BAR + 3.5) * SR)
    env = envelope(n, 2.2, 2.6)
    for j, note in enumerate(ch['pad']):
        for d, pan in ((-0.0035, -0.55), (0.0035, 0.55)):
            v = soft_saw(hz(note), n, detune=d) * env
            put(v, max(0, start), pan=pan * (0.4 + 0.2 * j), gain=0.020)
    bass = soft_saw(hz(ch['bass']), n, harmonics=4) * env
    put(bass, max(0, start), gain=0.05)

# фильтр пэда — тёплый, без шипения
sos = signal.butter(2, 1500, btype='low', fs=SR, output='sos')
L = signal.sosfilt(sos, L); R = signal.sosfilt(sos, R)

# ——— щипки ———
PL = np.zeros(N); PR = np.zeros(N)
def pluck(freq, velocity):
    n = int(3.2 * SR)
    tt = np.arange(n) / SR
    x = np.zeros(n)
    for k in range(1, 9):
        if freq * k > 12000:
            break
        amp = (1 / k ** 1.1) * (1.0 if k == 1 else 0.7)
        x += amp * np.sin(2 * np.pi * freq * k * tt * (1 + 0.0004 * k * k)) * np.exp(-tt * (1.4 + 0.9 * k))
    x *= np.clip(tt / 0.003, 0, 1)
    return x * velocity

# узор: на каждую долю (1 с) — нота с вероятностью, иногда половинка доли
beat = 1.0
start_at = 2.0
steps = int((DUR - start_at - 3) / (beat / 2))
last = None
for s in range(steps):
    at = start_at + s * beat / 2
    ch = CHORDS[int(at // BAR) % 4]
    on_beat = s % 2 == 0
    p = 0.62 if on_beat else 0.2
    if rng.random() > p:
        continue
    choices = ch['pluck']
    idx = rng.integers(0, len(choices))
    if last is not None and rng.random() < 0.6:          # плавный узор: чаще к соседней ноте
        idx = int(np.clip(last + rng.choice([-1, 1]), 0, len(choices) - 1))
    last = idx
    note = choices[idx] + (12 if rng.random() < 0.12 else 0)
    vel = (0.9 if on_beat else 0.55) * rng.uniform(0.7, 1.0)
    x = pluck(hz(note), vel)
    i = int((at + rng.uniform(-0.012, 0.012)) * SR)
    x = x[:N - i]
    pan = rng.uniform(-0.6, 0.6)
    PL[i:i + len(x)] += x * np.cos((pan + 1) * np.pi / 4)
    PR[i:i + len(x)] += x * np.sin((pan + 1) * np.pi / 4)
L += PL * 0.05; R += PR * 0.05

# ——— зал ———
def hall(x, seconds=2.6, seed=5):
    n = int(seconds * SR)
    tt = np.arange(n) / SR
    g = np.random.default_rng(seed)
    ir = g.standard_normal(n) * np.exp(-tt / (seconds / 6.5))
    ir = signal.sosfilt(signal.butter(2, [200, 6000], btype='band', fs=SR, output='sos'), ir)
    ir /= np.sqrt(np.sum(ir ** 2))
    return signal.fftconvolve(x, ir)[:len(x)]
wetL = hall(L, seed=5); wetR = hall(R, seed=6)
L = L * 0.72 + wetL * 0.42; R = R * 0.72 + wetR * 0.42

# ——— края: вход и уход ———
n_total = int(DUR * SR)
L = L[:n_total]; R = R[:n_total]
fade_in = int(2.5 * SR); fade_out = int(3.5 * SR)
for ch in (L, R):
    ch[:fade_in] *= np.linspace(0, 1, fade_in) ** 2
    ch[-fade_out:] *= np.linspace(1, 0, fade_out) ** 1.5

peak = max(np.abs(L).max(), np.abs(R).max())
L /= peak / 0.5; R /= peak / 0.5
pcm = (np.stack([L, R], axis=1) * 32767).astype('<i2')
os.makedirs(BUILD, exist_ok=True)
with wave.open(os.path.join(BUILD, 'music.wav'), 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(f'music.wav: {DUR:.1f} с')
