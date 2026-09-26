"""
Озвучка обучающего ролика «Царства».

Голос — ElevenLabs Multilingual v2 (голос и настройки — в script.json → voice).
Каждая глава читается целиком, одним дублем: так голос строит интонацию на
весь абзац, а не повторяет один и тот же дикторский рисунок в каждой фразе.
Соседние главы идут в запрос как previous_text / next_text, seed и настройки
одни на весь ролик. Где начинается и кончается каждая фраза и каждое слово,
берётся из посимвольной разметки времени, которую ElevenLabs отдаёт вместе
со звуком (text-to-speech/…/with-timestamps), — действие на экране и
субтитр встают ровно по голосу.

Голос читает не сам субтитр, а его «произносимую» версию: script.json →
speak (паузы, тире, многоточия, выделение главных слов заглавными; слова те
же) и say (написание имён, которые голос читает неверно). Проверено
распознаванием речи (ElevenLabs Speech to Text).

Ответы кэшируются в build/voice-raw по хэшу запроса: повторный запуск без
изменений текста не тратит символы.

Обработка лёгкая, без эха: срез низа до 70 Гц, немного тела голоса,
приглушённые шипящие, мягкое сжатие.

    ELEVENLABS_API_KEY=sk_… python3 promo/kingdoms-tutorial/voice.py
    → build/voice.wav (48 кГц) и shots/narration.js (window.NARRATION)
"""
import base64
import hashlib
import re
import json
import os
import subprocess
import urllib.request
import wave

import numpy as np
from scipy import signal

HERE = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.join(HERE, 'build')
RAW = os.path.join(BUILD, 'voice-raw')
SR = 48000
LEAD = 1.4                 # тишина до первой фразы — заставка
GAP_SEGMENT = 1.1          # между главами (сменой картинки), сверх паузы в конце дубля
TAIL = 2.6                 # после последней фразы — финальный кадр
FFMPEG = os.environ.get('FFMPEG', '/usr/local/lib/python3.11/dist-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2')
API = 'https://api.elevenlabs.io/v1/text-to-speech/{}/with-timestamps?output_format=mp3_44100_128'


def spoken(text, say):
    """Написание для голоса: script.json → say правит ударения и имена, субтитр остаётся как есть."""
    for a, b in say.items():
        text = text.replace(a, b)
    return text


def synth(text, prev, nxt, voice, seed):
    """Глава → (моно 48 кГц, время конца каждого символа text); ответ API кэшируется по хэшу запроса."""
    body = {
        'text': text,
        'model_id': voice['model'],
        'language_code': 'ru',
        'seed': seed,
        'voice_settings': voice['settings'],
    }
    if prev:
        body['previous_text'] = prev
    if nxt:
        body['next_text'] = nxt
    key = hashlib.sha1(json.dumps([voice['id'], body], ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:16]
    path = os.path.join(RAW, key + '.json')
    if not os.path.exists(path):
        req = urllib.request.Request(API.format(voice['id']), data=json.dumps(body).encode(), headers={
            'xi-api-key': os.environ['ELEVENLABS_API_KEY'], 'Content-Type': 'application/json'})
        data = urllib.request.urlopen(req, timeout=300).read()
        with open(path, 'wb') as f:
            f.write(data)
    res = json.load(open(path, encoding='utf-8'))
    al = res['alignment']
    if ''.join(al['characters']) != text:
        raise SystemExit(f'разметка не совпала с текстом: {text[:60]}…')
    pcm = subprocess.run([FFMPEG, '-loglevel', 'error', '-i', 'pipe:', '-f', 's16le', '-ac', '1', '-ar', str(SR), '-'],
                         input=base64.b64decode(res['audio_base64']), capture_output=True, check=True).stdout
    x = np.frombuffer(pcm, dtype='<i2').astype(np.float64) / 32768
    return x, al['character_start_times_seconds'], al['character_end_times_seconds']


WORD = re.compile(r"[\w-]+")


def words(text):
    """Слова фразы: (позиция, слово) — без знаков препинания и тире."""
    return [(m.start(), m.group().lower()) for m in WORD.finditer(text)]


def trim_tail(x, threshold_db=-42, pad=0.12):
    """Срезать тишину после последнего звука дубля: порог по огибающей 10 мс, мягкое затухание."""
    win = int(0.01 * SR)
    env = np.sqrt(np.convolve(x ** 2, np.ones(win) / win, mode='same'))
    loud = np.where(env > np.max(env) * 10 ** (threshold_db / 20))[0]
    y = x[:min(len(x), loud[-1] + int(pad * SR))].copy()
    fade = int(0.04 * SR)
    y[-fade:] *= np.linspace(1, 0, fade)
    return y


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


def main():
    os.makedirs(RAW, exist_ok=True)
    script = json.load(open(os.path.join(HERE, 'script.json'), encoding='utf-8'))
    voice = script['voice']
    say = script.get('say', {})
    # глава → произносимые фразы: speak (паузы, выделение) и say (имена)
    chapters = []
    for seg in script['segments']:
        speak = seg.get('speak', {})
        chapters.append([spoken(speak.get(str(i), t), say) for i, t in enumerate(seg['sentences'])])
    parts = []
    timeline = []
    at = LEAD
    for si, seg in enumerate(script['segments']):
        if si:
            at += GAP_SEGMENT
        text = ' '.join(chapters[si])
        prev = ' '.join(chapters[si - 1]) if si else ''
        nxt = ' '.join(chapters[si + 1]) if si + 1 < len(chapters) else ''
        x, starts, ends = synth(text, prev, nxt, voice, seg.get('seed', voice['seed']))
        # дубль: от первого звука до хвоста последнего
        head = max(0.0, starts[0] - 0.06)
        x = trim_tail(x[int(head * SR):])
        x[:int(0.01 * SR)] *= np.linspace(0, 1, int(0.01 * SR))
        seg_start = at
        lines = []
        pos = 0
        for li, t in enumerate(seg['sentences']):
            said = chapters[si][li]
            a = pos
            b = a + len(said)
            last = max(i for i in range(a, b) if not said[i - a].isspace())
            line = {'text': t, 'start': round(at + starts[a] - head, 3), 'end': round(at + ends[last] - head, 3)}
            # время слов: слова субтитра и произносимой фразы идут один к одному
            ws, wt = words(t), words(said)
            if len(ws) == len(wt):
                line['words'] = [[p, round(at + starts[a + q] - head, 3)] for (p, _), (q, _) in zip(ws, wt)]
            else:
                print(f'  ! слова не совпали, время слов по доле букв: {t[:50]}')
            lines.append(line)
            pos = b + 1
        parts.append((at, x))
        at += len(x) / SR
        timeline.append({'id': seg['id'], 'chapter': seg['chapter'], 'start': round(seg_start, 3), 'end': round(at, 3), 'lines': lines})
    total = at + TAIL
    out = np.zeros(int(total * SR) + 1)
    for start, x in parts:
        i = int(round(start * SR))
        out[i:i + len(x)] += x
    # лёгкая обработка: низ под 70 Гц прочь, чуть тела, шипящие мягче; без эха
    out = signal.lfilter(*signal.butter(2, 70, btype='high', fs=SR), out)
    out = shelf(out, 160, 1.5, 'low')
    out = peaking(out, 6800, -2.0, 2.0)
    out = compress(out, threshold_db=-22, ratio=2.0)
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
