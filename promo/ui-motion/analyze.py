"""
Сетка долей из самого звука — не из того, что трек «должен» быть 120 BPM.

Трек — петля, поэтому звук разбирается по кругу: к началу приставлен его же
конец, к концу — начало. Иначе первая доля петли, у которой «до неё» нет
ничего, выглядела бы для анализа тишиной, а не ударом.

1) Огибающая начал низа (бочка) → моменты ударов → темп и фаза подгонкой
   прямой методом наименьших квадратов (номер доли → время удара).
2) Сильная доля — та, где меняется гармония (бас и аккорды меняются на такте),
   хлопки — где больше всего середины (на 2 и 4).
3) Для каждой доли — измеренный пик бочки: к нему потом ставятся звуки
   интерфейса и события в кадре.
4) Стык петли: скачок сигнала на границе не больше, чем на любом другом
   начале такта.

    python3 promo/ui-motion/analyze.py [build/music.wav]  →  build/beats.json
"""
import json
import os
import sys
import wave

import numpy as np

HERE = os.path.dirname(__file__)
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'build', 'music.wav')

with wave.open(path) as w:
    sr = w.getframerate()
    raw = np.frombuffer(w.readframes(w.getnframes()), dtype='<i2').reshape(-1, w.getnchannels())
x = raw.mean(axis=1) / 32768.0
n = len(x)
duration = n / sr

PAD = sr  # секунда с каждой стороны — по кругу
xe = np.concatenate([x[-PAD:], x, x[:PAD]])
HOP, WIN = 128, 1024
frames = 1 + (len(xe) - WIN) // HOP
window = np.hanning(WIN)
spec = np.abs(np.stack([np.fft.rfft(xe[i * HOP:i * HOP + WIN] * window) for i in range(frames)]))
freqs = np.fft.rfftfreq(WIN, 1 / sr)
# время кадра — его середина, в секундах петли
ftime = (np.arange(frames) * HOP + WIN / 2 - PAD) / sr
fps = sr / HOP

# ——— удары бочки: пики положительного прироста энергии низа ———
low = np.log1p(spec[:, freqs < 150].sum(axis=1))
rise = np.maximum(np.diff(low, prepend=low[0]), 0)
thr = rise.max() * 0.35
cand = [i for i in range(1, frames - 1) if rise[i] > thr and rise[i] >= rise[i - 1] and rise[i] > rise[i + 1]]
onsets = np.array([ftime[i] for i in cand])
onsets = onsets[(onsets > -0.25) & (onsets < duration + 0.25)]

# ——— темп: автокорреляция огибающей, затем подгонка прямой ———
ac = np.correlate(rise - rise.mean(), rise - rise.mean(), mode='full')[frames - 1:]
lags = np.arange(len(ac)) / fps
ok = (lags > 60 / 180) & (lags < 60 / 70)
period0 = lags[np.argmax(ac * ok)]
# Фаза — гребёнкой: сдвиг сетки, на который приходится больше всего прироста
# низа. Потом в подгонку идут только удары у самой сетки: бас на слабых
# восьмых тоже даёт прирост низа, но на сетку долей не ложится.
# Гребёнка идёт по сглаженной огибающей и сразу по сетке темпов вокруг
# найденного: шаг автокорреляции грубый (2,7 мс), и за 28 долей ошибка
# периода набегала бы в сдвиг на полудолю.
kernel = np.exp(-0.5 * (np.arange(-12, 13) * HOP / sr / 0.008) ** 2)
soft = np.convolve(rise, kernel / kernel.sum(), mode='same')
def frame_idx(t):
    return np.clip(np.round((t * sr + PAD - WIN / 2) / HOP).astype(int), 0, frames - 1)
best_score, period0, ph0 = -1, period0, 0.0
count = int(duration / period0) + 1
for per in np.linspace(period0 * 0.985, period0 * 1.015, 121):
    phs = np.linspace(-0.05, per - 0.05, 500, endpoint=False)
    grid = phs[:, None] + np.arange(count)[None, :] * per
    sc = soft[frame_idx(grid)].sum(axis=1)
    i = int(np.argmax(sc))
    if sc[i] > best_score:
        best_score, period0, ph0 = sc[i], per, phs[i]
# Уточнение по самому сигналу: у каждой доли сетки — низ до 180 Гц, огибающая
# с шагом в отсчёт, начало удара — первый отсчёт выше 30 % местного пика.
spec_all = np.fft.rfft(xe)
f_all = np.fft.rfftfreq(len(xe), 1 / sr)
lowsig = np.fft.irfft(spec_all * (f_all < 180), len(xe))
envl = np.convolve(np.abs(lowsig), np.ones(48) / 48, mode='same')
ks, found = [], []
for j in range(-1, count + 1):
    g = ph0 + j * period0
    a0 = int(round((g - 0.04) * sr)) + PAD
    a1 = int(round((g + 0.06) * sr)) + PAD
    if a0 < 0 or a1 > len(xe):
        continue
    seg = envl[a0:a1]
    first = int(np.argmax(seg > 0.3 * seg.max()))
    ks.append(j)
    found.append((a0 + first - PAD) / sr)
onsets, k = np.array(found), np.array(ks, dtype=float)
A = np.stack([k, np.ones_like(k)], axis=1)
# Подгонка с отсевом: доля, у которой низ поднялся заранее (бас-подход к
# такту), даёт «ранний» удар — такие точки после первой подгонки выбрасываются.
keep = np.ones(len(onsets), dtype=bool)
for _ in range(3):
    (period, t0), *_ = np.linalg.lstsq(A[keep], onsets[keep], rcond=None)
    resid = np.abs(A @ np.array([period, t0]) - onsets)
    keep = resid < max(0.004, 3 * np.median(resid[keep]))
jitter_ms = float(resid[keep].max() * 1000)
outliers = int((~keep).sum())
phase = t0 % period
if phase > period - 0.02:  # доля у самого конца периода — это доля в нуле
    phase -= period
beats = phase + np.arange(int(np.ceil((duration - phase) / period - 1e-6))) * period
beats = beats[(beats >= -0.02) & (beats < duration - 0.02)]
bpm = 60 / period

# ——— измеренные пики (по модулю петли) ———
# Пик удара — по низу: на 2 и 4 поверх бочки лежит хлопок, и пик всей
# волны там — его, а не удара, на который ставится звук интерфейса.
peaks = []
for b in beats:
    a = int(round((b - 0.02) * sr)) + PAD
    z = int(round((b + 0.05) * sr)) + PAD
    peaks.append((a - PAD + int(np.argmax(np.abs(lowsig[a:z])))) / sr)
peaks = np.array(peaks)

# ——— хлопки и сильная доля ———
def band(lo, hi):
    return spec[:, (freqs > lo) & (freqs < hi)].sum(axis=1)

mid = band(1000, 5000)
harm = spec[:, (freqs > 60) & (freqs < 1000)]

def frame_at(t):
    return int(np.clip(np.searchsorted(ftime, t), 0, frames - 1))

clap_level = np.array([mid[frame_at(b):frame_at(b + 0.08) + 1].max() for b in beats])
novelty = []
for b in beats:
    prev = harm[frame_at(b - period * 0.9):frame_at(b - 0.05)].mean(axis=0)
    nxt = harm[frame_at(b + 0.05):frame_at(b + period * 0.9)].mean(axis=0)
    novelty.append(np.linalg.norm(nxt - prev) / (np.linalg.norm(prev) + 1e-9))
novelty = np.array(novelty)
claps_on = sorted(range(4), key=lambda p: -clap_level[p::4].mean())[:2]
quiet = [p for p in range(4) if p not in claps_on]
# Сильная доля: окна длиной в такт, начатые с неё, сильнее всего отличаются от
# соседних — аккорды и бас меняются на такте, и только при верной фазе окна
# не смешивают два аккорда в одном.
bassband = spec[:, (freqs > 50) & (freqs < 400)]
def bar_change(p):
    diffs = []
    for j in range(p + 4, len(beats) - 3, 4):
        cur = bassband[frame_at(beats[j]):frame_at(beats[j] + 4 * period)].mean(axis=0)
        prv = bassband[frame_at(beats[j] - 4 * period):frame_at(beats[j])].mean(axis=0)
        diffs.append(np.linalg.norm(cur - prv) / (np.linalg.norm(prv) + 1e-9))
    return float(np.mean(diffs)) if diffs else 0.0
downbeat = max(quiet, key=bar_change)

# ——— стык петли ———
def jump(i):
    return abs(x[i % n] - x[(i - 1) % n])

bar_starts = [int(round(b * sr)) for b in beats[downbeat::4]]
others = [max(jump(s + d) for d in range(-48, 96)) for s in bar_starts if s > 48]
at_seam = max(jump(d) for d in range(-48, 96))
seam_ok = at_seam <= max(others) * 1.05

report = {
    'file': os.path.basename(path),
    'sampleRate': sr,
    'duration': duration,
    'bpm': round(float(bpm), 3),
    'period': float(period),
    'onsetJitterMs': round(jitter_ms, 2),
    'onsetOutliers': outliers,
    'firstBeat': float(beats[0]),
    'downbeatIndex': int(downbeat),
    'clapBeatsInBar': sorted(((p - downbeat) % 4) + 1 for p in claps_on),
    'beats': [round(float(b), 5) for b in beats],
    'peaks': [round(float(p), 5) for p in peaks],
    'peakOffsetMs': round(float(np.median(peaks - beats) * 1000), 2),
    'seam': {'jumpAtSeam': round(float(at_seam), 4), 'maxJumpAtOtherBars': round(float(max(others)), 4), 'ok': bool(seam_ok)},
    'peakDbfs': round(float(20 * np.log10(np.abs(x).max())), 2),
    'rmsDbfs': round(float(20 * np.log10(np.sqrt(np.mean(x ** 2)))), 2),
}
core = spec[frame_at(0):frame_at(duration)]
power = core.mean(axis=0) ** 2
total = power.sum()
bands = {'sub <60': (0, 60), 'low 60-250': (60, 250), 'mid 250-2k': (250, 2000), 'high 2k-8k': (2000, 8000), 'air >8k': (8000, sr / 2)}
report['bandDb'] = {k: round(float(10 * np.log10(power[(freqs >= a) & (freqs < b)].sum() / total + 1e-12)), 1) for k, (a, b) in bands.items()}

out = os.path.join(os.path.dirname(path), 'beats.json')
with open(out, 'w') as f:
    json.dump(report, f, indent=1, ensure_ascii=False)
print(json.dumps({k: v for k, v in report.items() if k not in ('beats', 'peaks')}, ensure_ascii=False, indent=1))
print('beats:', len(beats), report['beats'][:4], '… peaks:', report['peaks'][:4])
