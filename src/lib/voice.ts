import Meyda from 'meyda';

// ===== بصمة صوت عالية الدقة للتمييز بين العديد من المتحدثين =====
// نستخرج لكل إطار: معاملات MFCC (نُسقط المعامل 0 المرتبط بالطاقة)،
// ثم نحسب مشتقاتها الزمنية (Delta) لالتقاط ديناميكية النطق.
// نضيف إحصائيات النبرة (Pitch/F0) عبر الارتباط الذاتي، وميزات طيفية.
// النتيجة متجه ثابت الطول (بصمة) يمثّل خصائص صوت المتحدث بشكل مميّز.
// إصدار البصمة الحالي = 2 (الطول = FP_DIM).

export const VOICE_FP_VERSION = 2;

const FRAME_SIZE = 512;
const HOP = 256;
const NUM_MFCC = 20; // نُبقي منها المعاملات 1..19 (نُسقط 0 = الطاقة)
const MFCC_KEEP = NUM_MFCC - 1; // 19
// نافذة أكبر لتقدير النبرة (تكفي للترددات المنخفضة حتى 60Hz)
const PITCH_WIN = 2048;
const PITCH_HOP = 1024;
const PITCH_MIN_HZ = 60;
const PITCH_MAX_HZ = 400;
// عتبة طاقة الإطار لتجاهل الصمت
const ENERGY_THRESHOLD = 0.0015;

// أبعاد البصمة:
// MFCC ثابتة: mean+std = 19*2 = 38
// MFCC مشتقة (Delta): mean+std = 19*2 = 38
// النبرة: mean, std, نسبة الأصوات المجهورة = 3
// طيفية (centroid, rolloff, flatness): mean+std لكلٍّ = 6
export const FP_DIM = 38 + 38 + 3 + 6; // = 85

export interface VoiceCaptureResult {
  fingerprint: number[]; // FP_DIM بُعد
  version: number;
  frames: number; // عدد الإطارات الصوتية المستخدمة
  voicedRatio: number; // نسبة الإطارات المجهورة (جودة العيّنة)
}

function meanStd(frames: number[][], dim: number): { mean: number[]; std: number[] } {
  const mean = new Array(dim).fill(0);
  for (const f of frames) for (let i = 0; i < dim; i++) mean[i] += f[i];
  for (let i = 0; i < dim; i++) mean[i] /= frames.length;
  const std = new Array(dim).fill(0);
  for (const f of frames) for (let i = 0; i < dim; i++) std[i] += (f[i] - mean[i]) ** 2;
  for (let i = 0; i < dim; i++) std[i] = Math.sqrt(std[i] / frames.length);
  return { mean, std };
}

// تقدير التردد الأساسي (النبرة) عبر الارتباط الذاتي؛ يُعيد 0 إذا كان الإطار غير مجهور
function estimatePitch(frame: Float32Array, sampleRate: number): number {
  const minLag = Math.floor(sampleRate / PITCH_MAX_HZ);
  const maxLag = Math.min(frame.length - 1, Math.floor(sampleRate / PITCH_MIN_HZ));

  // طاقة الإطار عند اللاغ 0
  let r0 = 0;
  for (let i = 0; i < frame.length; i++) r0 += frame[i] * frame[i];
  if (r0 < 1e-6) return 0;

  let bestLag = -1;
  let bestCorr = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0;
    for (let i = 0; i + lag < frame.length; i++) corr += frame[i] * frame[i + lag];
    const norm = corr / r0;
    if (norm > bestCorr) {
      bestCorr = norm;
      bestLag = lag;
    }
  }
  // عتبة الجهارة: ارتباط ذاتي قوي كافٍ
  if (bestLag > 0 && bestCorr > 0.3) return sampleRate / bestLag;
  return 0;
}

// تحويل AudioBuffer إلى بصمة صوتية عالية الدقة
export function bufferToFingerprint(buffer: AudioBuffer): VoiceCaptureResult | null {
  const data = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;

  Meyda.sampleRate = sampleRate;
  Meyda.bufferSize = FRAME_SIZE;
  Meyda.numberOfMFCCCoefficients = NUM_MFCC;

  const staticFrames: number[][] = []; // MFCC[1..19] لكل إطار مجهور/نشط
  const centroids: number[] = [];
  const rolloffs: number[] = [];
  const flatnesses: number[] = [];

  for (let start = 0; start + FRAME_SIZE <= data.length; start += HOP) {
    const frame = data.subarray(start, start + FRAME_SIZE);

    let energy = 0;
    for (let i = 0; i < frame.length; i++) energy += frame[i] * frame[i];
    energy = Math.sqrt(energy / frame.length);
    if (energy < ENERGY_THRESHOLD) continue;

    const feats = Meyda.extract(
      ['mfcc', 'spectralCentroid', 'spectralRolloff', 'spectralFlatness'],
      frame,
    ) as {
      mfcc: number[];
      spectralCentroid: number;
      spectralRolloff: number;
      spectralFlatness: number;
    } | null;

    if (
      feats &&
      Array.isArray(feats.mfcc) &&
      feats.mfcc.length === NUM_MFCC &&
      feats.mfcc.every((v) => Number.isFinite(v))
    ) {
      staticFrames.push(feats.mfcc.slice(1)); // إسقاط المعامل 0
      if (Number.isFinite(feats.spectralCentroid)) centroids.push(feats.spectralCentroid);
      if (Number.isFinite(feats.spectralRolloff)) rolloffs.push(feats.spectralRolloff);
      if (Number.isFinite(feats.spectralFlatness)) flatnesses.push(feats.spectralFlatness);
    }
  }

  if (staticFrames.length < 12) return null; // صوت غير كافٍ

  // مشتقات MFCC الزمنية (Delta): (t+1 - t-1)/2
  const deltaFrames: number[][] = [];
  for (let t = 0; t < staticFrames.length; t++) {
    const prev = staticFrames[Math.max(0, t - 1)];
    const next = staticFrames[Math.min(staticFrames.length - 1, t + 1)];
    const d = new Array(MFCC_KEEP);
    for (let i = 0; i < MFCC_KEEP; i++) d[i] = (next[i] - prev[i]) / 2;
    deltaFrames.push(d);
  }

  // إحصائيات النبرة عبر نافذة أكبر
  const pitches: number[] = [];
  let voicedCount = 0;
  let pitchWindows = 0;
  for (let start = 0; start + PITCH_WIN <= data.length; start += PITCH_HOP) {
    pitchWindows++;
    const win = data.subarray(start, start + PITCH_WIN);
    const f0 = estimatePitch(win, sampleRate);
    if (f0 > 0) {
      pitches.push(f0);
      voicedCount++;
    }
  }
  const voicedRatio = pitchWindows > 0 ? voicedCount / pitchWindows : 0;

  let pitchMean = 0;
  let pitchStd = 0;
  if (pitches.length > 0) {
    pitchMean = pitches.reduce((s, v) => s + v, 0) / pitches.length;
    pitchStd = Math.sqrt(
      pitches.reduce((s, v) => s + (v - pitchMean) ** 2, 0) / pitches.length,
    );
  }

  const statStatic = meanStd(staticFrames, MFCC_KEEP);
  const statDelta = meanStd(deltaFrames, MFCC_KEEP);

  const spMean = (arr: number[]) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0);
  const spStd = (arr: number[], m: number) =>
    arr.length ? Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length) : 0;
  const cMean = spMean(centroids);
  const rMean = spMean(rolloffs);
  const fMean = spMean(flatnesses);

  // نطبّع النبرة تقريبياً لنطاق مقارب لبقية الميزات
  const fingerprint = [
    ...statStatic.mean,
    ...statStatic.std,
    ...statDelta.mean,
    ...statDelta.std,
    pitchMean / 100,
    pitchStd / 100,
    voicedRatio,
    cMean,
    spStd(centroids, cMean),
    rMean,
    spStd(rolloffs, rMean),
    fMean,
    spStd(flatnesses, fMean),
  ];

  return {
    fingerprint,
    version: VOICE_FP_VERSION,
    frames: staticFrames.length,
    voicedRatio,
  };
}

// تسجيل صوت من الميكروفون لمدة محددة وإرجاع AudioBuffer
export async function recordAudio(
  stream: MediaStream,
  durationMs: number,
  onProgress?: (ratio: number) => void,
): Promise<AudioBuffer> {
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  const audioCtx: AudioContext = new AudioCtx();
  const source = audioCtx.createMediaStreamSource(stream);
  const processor = audioCtx.createScriptProcessor(4096, 1, 1);

  const chunks: Float32Array[] = [];
  const start = performance.now();
  let finished = false;

  return new Promise<AudioBuffer>((resolve, reject) => {
    const finish = (err?: Error) => {
      if (finished) return; // منع الاستدعاء المزدوج وإغلاق السياق مرتين
      finished = true;
      try {
        processor.disconnect();
        source.disconnect();
      } catch {
        /* تجاهل */
      }
      if (err) {
        if (audioCtx.state !== 'closed') audioCtx.close().catch(() => {});
        reject(err);
        return;
      }
      // بناء المخزن الصوتي قبل إغلاق السياق
      const total = chunks.reduce((s, c) => s + c.length, 0);
      const out = audioCtx.createBuffer(1, Math.max(1, total), audioCtx.sampleRate);
      const outData = out.getChannelData(0);
      let offset = 0;
      for (const c of chunks) {
        outData.set(c, offset);
        offset += c.length;
      }
      if (audioCtx.state !== 'closed') audioCtx.close().catch(() => {});
      resolve(out);
    };

    processor.onaudioprocess = (e) => {
      if (finished) return;
      const input = e.inputBuffer.getChannelData(0);
      chunks.push(new Float32Array(input));
      const elapsed = performance.now() - start;
      onProgress?.(Math.min(1, elapsed / durationMs));
      if (elapsed >= durationMs) {
        if (chunks.length === 0) finish(new Error('لم يتم التقاط أي صوت'));
        else finish();
      }
    };
    source.connect(processor);
    // ScriptProcessor يحتاج للاتصال بالوجهة كي يعمل في بعض المتصفحات
    processor.connect(audioCtx.destination);

    // حماية زمنية إضافية في حال توقف الأحداث
    setTimeout(() => {
      if (!finished) {
        if (chunks.length === 0) finish(new Error('لم يتم التقاط أي صوت'));
        else finish();
      }
    }, durationMs + 1500);
  });
}
