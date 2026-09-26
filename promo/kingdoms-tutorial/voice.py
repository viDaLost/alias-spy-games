"""
Озвучка обучающего ролика «Царства».

Голос — RHVoice «Александр» в улучшенном качестве (aleksandr-hq, пакет
rhvoice-russian из Ubuntu): он работает без сети, а нейросетевые голоса
в этом окружении не скачать. Каждая фраза сценария (script.json)
синтезируется отдельно — так известно, где она начинается и кончается, и
действие на экране и субтитр встают ровно по ней.

Обработка — чтобы синтез звучал теплее и ровнее: срез низа до 70 Гц,
мягкий подъём тела голоса около 180 Гц, приглушённые шипящие, сжатие
динамики, маленькая комната.

    python3 promo/kingdoms-tutorial/voice.py
    → build/voice.wav (48 кГц) и shots/narration.js (window.NARRATION)
"""
import json
import os
import subprocess
import wave

import numpy as np
from scipy import signal

HERE = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.join(HERE, 'build')
RAW = os.path.join(BUILD, 'voice-raw')
SR = 48000
RATE = 104                 # темп голоса, % от обычного: разборчиво, но без тягучести
LEAD = 1.4                 # тишина до первой фразы — заставка
GAP_SENTENCE = 0.34        # между фразами одного фрагмента
GAP_SEGMENT = 0.95         # между фрагментами (сменой картинки)
TAIL = 2.6                 # после последней фразы — финальный кадр


def synth(text, path, voice):
    subprocess.run(['RHVoice-test', '-p', voice, '-r', str(RATE), '-o', path], input=text.encode('utf-8'), check=True)
    with wave.open(path) as w:
        rate = w.getframerate()
        x = np.frombuffer(w.readframes(w.getnframes()), dtype='<i2').astype(np.float64) / 32768
    return signal.resample_poly(x, SR, rate)


def trim(x, threshold=0.004, pad=0.03):
    """Срезать тишину по краям фразы (синтез оставляет паузы разной длины)."""
    loud = np.where(np.abs(x) > threshold)[0]
    if not len(loud):
        return x
    a = max(0, loud[0] - int(pad * SR))
    b = min(len(x), loud[-1] + int(pad * SR))
    return x[a:b]


def shelf(x, freq, gain_db, kind):
    """Полка второго порядка (RBJ)."""
    a_ = 10 ** (gain_db / 40)
    w0 = 2 * np.pi * freq / SR
    alpha = np.sin(w0) / 2 * np.sqrt(2)
    cos = np.cos(w0)
    if kind == 'low':
        b = [a_ * ((a_ + 1) - (a_ - 1) * cos + 2 * np.sqrt(a_) * alpha), 2 * a_ * ((a_ - 1) - (a_ + 1) * cos),
             a_ * ((a_ + 1) - (a_ - 1) * cos - 2 * np.sqrt(a_) * alpha)]
        a = [(a_ + 1) + (a_ - 1) * cos + 2 * np.sqrt(a_) * alpha, -2 * ((a_ - 1) + (a_ + 1) * cos),
             (a_ + 1) + (a_ - 1) * cos - 2 * np.sqrt(a_) * alpha]
    else:
        b = [a_ * ((a_ + 1) + (a_ - 1) * cos + 2 * np.sqrt(a_) * alpha), -2 * a_ * ((a_ - 1) + (a_ + 1) * cos),
             a_ * ((a_ + 1) + (a_ - 1) * cos - 2 * np.sqrt(a_) * alpha)]
        a = [(a_ + 1) - (a_ - 1) * cos + 2 * np.sqrt(a_) * alpha, 2 * ((a_ - 1) - (a_ + 1) * cos),
             (a_ + 1) - (a_ - 1) * cos - 2 * np.sqrt(a_) * alpha]
    return signal.lfilter(np.array(b) / a[0], np.array(a) / a[0], x)


def peaking(x, freq, gain_db, q):
    a_ = 10 ** (gain_db / 40)
    w0 = 2 * np.pi * freq / SR
    alpha = np.sin(w0) / (2 * q)
    b = [1 + alpha * a_, -2 * np.cos(w0), 1 - alpha * a_]
    a = [1 + alpha / a_, -2 * np.cos(w0), 1 - alpha / a_]
    return signal.lfilter(np.array(b) / a[0], np.array(a) / a[0], x)


def compress(x, threshold_db=-20, ratio=2.6, attack=0.006, release=0.12):
    env = np.abs(x)
    a_att = np.exp(-1 / (attack * SR))
    a_rel = np.exp(-1 / (release * SR))
    out = signal.lfilter([1 - a_rel], [1, -a_rel], env)          # грубая огибающая
    out = np.maximum(out, signal.lfilter([1 - a_att], [1, -a_att], env))
    level = 20 * np.log10(np.maximum(out, 1e-6))
    over = np.maximum(level - threshold_db, 0)
    gain = 10 ** (-(over - over / ratio) / 20)
    return x * gain


def room(x, seconds=0.45, mix=0.09):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    rng = np.random.default_rng(3)
    ir = rng.standard_normal(n) * np.exp(-t / (seconds / 6))
    ir = signal.lfilter(*signal.butter(2, [300, 5000], btype='band', fs=SR), ir)
    ir /= np.sqrt(np.sum(ir ** 2))
    wet = signal.fftconvolve(x, ir)[:len(x)]
    return x * (1 - mix) + wet * mix


def main():
    os.makedirs(RAW, exist_ok=True)
    script = json.load(open(os.path.join(HERE, 'script.json'), encoding='utf-8'))
    voice = script['voice']
    parts = []
    timeline = []
    at = LEAD
    for si, seg in enumerate(script['segments']):
        if si:
            at += GAP_SEGMENT
        seg_start = at
        lines = []
        for li, text in enumerate(seg['sentences']):
            if li:
                at += GAP_SENTENCE
            x = trim(synth(text, os.path.join(RAW, f'{seg["id"]}-{li}.wav'), voice))
            lines.append({'text': text, 'start': round(at, 3), 'end': round(at + len(x) / SR, 3)})
            parts.append((at, x))
            at += len(x) / SR
        timeline.append({'id': seg['id'], 'chapter': seg['chapter'], 'start': round(seg_start, 3), 'end': round(at, 3), 'lines': lines})
    total = at + TAIL
    out = np.zeros(int(total * SR) + 1)
    for start, x in parts:
        i = int(round(start * SR))
        out[i:i + len(x)] += x
    # тембр: низ под 70 Гц прочь, тело голоса теплее, шипящие мягче, воздух чуть ярче
    out = signal.lfilter(*signal.butter(2, 70, btype='high', fs=SR), out)
    out = shelf(out, 180, 2.5, 'low')
    out = peaking(out, 3200, -1.5, 1.2)
    out = peaking(out, 6800, -3.0, 2.0)
    out = shelf(out, 11000, 1.5, 'high')
    out = compress(out)
    out = room(out)
    out *= 10 ** (-3 / 20) / np.max(np.abs(out))       # пики −3 дБ
    pcm = (np.clip(out, -1, 1) * 32767).astype('<i2')
    with wave.open(os.path.join(BUILD, 'voice.wav'), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    os.makedirs(os.path.join(HERE, 'shots'), exist_ok=True)
    with open(os.path.join(HERE, 'shots', 'narration.js'), 'w', encoding='utf-8') as f:
        f.write('window.NARRATION = ' + json.dumps({'duration': round(total, 3), 'segments': timeline}, ensure_ascii=False) + ';\n')
    print(f'voice.wav: {total:.1f} s, {sum(len(s["lines"]) for s in timeline)} фраз')
    for seg in timeline:
        print(f'  {seg["start"]:6.1f}–{seg["end"]:6.1f}  {seg["chapter"]}')


if __name__ == '__main__':
    main()
