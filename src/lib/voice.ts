import Meyda from 'meyda';

// بصمة الصوت عبر ميزات MFCC.
// نستخرج من التسجيل عدة إطارات MFCC (13 معامل لكل إطار)،
// ثم نحسب المتوسط والانحراف المعياري لتكوين متجه ثابت الطول (26 بُعد)
// يمثّل "بصمة" صوت المتحدث بشكل مستقل نسبيًا عن الكلمات المنطوقة.

const FRAME_SIZE = 512;
const HOP = 256;
const NUM_MFCC = 13;
// عتبة طاقة الإطار لتجاهل الصمت
const ENERGY_THRESHOLD = 0.0015;

export interface VoiceCaptureResult {
  fingerprint: number[]; // 26 بُعد
  frames: number; // عدد الإطارات الصوتية المستخدمة
}

// تحويل AudioBuffer إلى بصمة صوتية
export function bufferToFingerprint(buffer: AudioBuffer): VoiceCaptureResult | null {
  // قناة أحادية
  const data = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;

  // إعدادات Meyda العامة (يجب ضبطها على الكائن قبل الاستخراج)
  Meyda.sampleRate = sampleRate;
  Meyda.bufferSize = FRAME_SIZE;
  Meyda.numberOfMFCCCoefficients = NUM_MFCC;

  const mfccFrames: number[][] = [];

  for (let start = 0; start + FRAME_SIZE <= data.length; start += HOP) {
    const frame = data.subarray(start, start + FRAME_SIZE);

    // حساب طاقة الإطار (RMS) لتجاهل الصمت
    let energy = 0;
    for (let i = 0; i < frame.length; i++) energy += frame[i] * frame[i];
    energy = Math.sqrt(energy / frame.length);
    if (energy < ENERGY_THRESHOLD) continue;

    const mfcc = Meyda.extract('mfcc', frame) as number[] | null;

    if (mfcc && mfcc.length === NUM_MFCC && mfcc.every((v) => Number.isFinite(v))) {
      mfccFrames.push(mfcc);
    }
  }

  if (mfccFrames.length < 10) return null; // صوت غير كافٍ

  // المتوسط والانحراف المعياري لكل معامل
  const mean = new Array(NUM_MFCC).fill(0);
  for (const f of mfccFrames) for (let i = 0; i < NUM_MFCC; i++) mean[i] += f[i];
  for (let i = 0; i < NUM_MFCC; i++) mean[i] /= mfccFrames.length;

  const std = new Array(NUM_MFCC).fill(0);
  for (const f of mfccFrames)
    for (let i = 0; i < NUM_MFCC; i++) std[i] += (f[i] - mean[i]) ** 2;
  for (let i = 0; i < NUM_MFCC; i++) std[i] = Math.sqrt(std[i] / mfccFrames.length);

  const fingerprint = [...mean, ...std];
  return { fingerprint, frames: mfccFrames.length };
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
