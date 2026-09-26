"""
Сведение: голос поверх музыки, музыка приседает под голос.

Голос (build/voice.wav, моно) — в центре. Музыка (build/music.wav) под фразами
тише на ~8 дБ: огибающая голоса с быстрой атакой и медленным отпуском, чтобы
музыка не «дышала» между словами. На смене глав — мягкий шорох поворота
экрана (время — та же середина паузы между главами, что и в index.html).
Громкость: речь около −18 дБ RMS, музыка в паузах около −27 дБ, пики не выше −1 дБ.

    python3 promo/kingdoms-tutorial/mix_audio.py  →  build/final.wav
"""
import json
import os
import re
import wave

import numpy as np
from scipy import signal

HERE = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.join(HERE, 'build')
rng = np.random.default_rng(31)

def read(path):
    with wave.open(path) as w:
        sr = w.getframerate(); ch = w.getnchannels()
        x = np.frombuffer(w.readframes(w.getnframes()), dtype='<i2').astype(np.float64) / 32768
    return sr, x.reshape(-1, ch)

sr, voice = read(os.path.join(BUILD, 'voice.wav'))
sr2, music = read(os.path.join(BUILD, 'music.wav'))
assert sr == sr2 == 48000
voice = voice[:, 0]
n = max(len(voice), len(music))
voice = np.pad(voice, (0, n - len(voice)))
music = np.pad(music, ((0, n - len(music)), (0, 0)))

# огибающая голоса → приглушение музыки
env = np.abs(voice)
win = int(0.03 * sr)
env = np.sqrt(np.convolve(env ** 2, np.ones(win) / win, mode='same'))
active = (env > 0.01).astype(np.float64)
a_att = np.exp(-1 / (0.08 * sr)); a_rel = np.exp(-1 / (0.9 * sr))
duck = np.zeros(n); g = 0.0
# одно-полюсный сглаживатель с разной атакой и отпуском (векторно: по кускам)
up = signal.lfilter([1 - a_att], [1, -a_att], active)
down = signal.lfilter([1 - a_rel], [1, -a_rel], active)
duck = np.maximum(up, down)
gain_db = -8.0 * np.clip(duck * 1.4, 0, 1)
mg = 10 ** (gain_db / 20)
music_raw = music
music = music * mg[:, None]

# шорох поворота на смене глав
narr = json.loads(re.sub(r'^window\.NARRATION = |;\s*$', '', open(os.path.join(HERE, 'shots', 'narration.js'), encoding='utf-8').read()))
segs = narr['segments']
flips = [(segs[i - 1]['end'] + segs[i]['start']) / 2 for i in range(1, len(segs))]
whoosh_len = int(0.9 * sr)
tt = np.arange(whoosh_len) / sr
sfx = np.zeros((n, 2))
for at in flips:
    noise = rng.standard_normal(whoosh_len)
    # полоса едет вверх и назад — как лист, повёрнутый ребром
    shape = np.sin(np.pi * tt / tt[-1]) ** 2
    lo = signal.sosfilt(signal.butter(2, [300, 2400], btype='band', fs=sr, output='sos'), noise)
    hi = signal.sosfilt(signal.butter(2, [1500, 7000], btype='band', fs=sr, output='sos'), noise)
    mix = lo * (1 - tt / tt[-1]) + hi * (tt / tt[-1]) * 0.6
    x = mix * shape * 0.05
    i = int((at - 0.45) * sr)
    pan = np.linspace(-0.5, 0.5, whoosh_len)
    sfx[i:i + whoosh_len, 0] += x * np.cos((pan + 1) * np.pi / 4)
    sfx[i:i + whoosh_len, 1] += x * np.sin((pan + 1) * np.pi / 4)

# уровни: речь к −18 дБ RMS по звучащим местам
speech_rms = np.sqrt(np.mean(voice[active > 0] ** 2))
vgain = 10 ** (-18 / 20) / speech_rms
v = voice * vgain
# музыка в паузах около −27 дБ RMS, под речью на 8 дБ тише — ощутимо ниже голоса
body = slice(3 * sr, n - 4 * sr)
music_level = 10 ** (-27 / 20) / np.sqrt(np.mean(music_raw[body, 0] ** 2))
out = np.stack([v, v], axis=1) * 0.92 + music * music_level + sfx * vgain
peak = np.abs(out).max()
if peak > 10 ** (-1 / 20):
    # мягкий предел: сжатие только того, что выше −3 дБ
    thr = 10 ** (-3 / 20)
    over = np.abs(out) > thr
    out[over] = np.sign(out[over]) * (thr + (1 - thr) * np.tanh((np.abs(out[over]) - thr) / (1 - thr)))
    out *= 10 ** (-1 / 20) / max(np.abs(out).max(), 1e-9)
pcm = (np.clip(out, -1, 1) * 32767).astype('<i2')
with wave.open(os.path.join(BUILD, 'final.wav'), 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(sr)
    w.writeframes(pcm.tobytes())
rms = lambda x: 20 * np.log10(np.sqrt(np.mean(x ** 2)) + 1e-12)
quiet = active < 0.5
print(f'final.wav: {n / sr:.1f} с; речь {rms(out[active > 0, 0]):.1f} дБ RMS, музыка без голоса {rms(music_raw[body, 0] * music_level):.1f} дБ RMS, под голосом {rms(music[active > 0, 0] * music_level):.1f}, пик {20 * np.log10(np.abs(out).max()):.1f} дБ')
