import type { Person } from './db';

// ===== دوال المسافة =====

export function euclidean(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

// تشابه جيب التمام (كوساين) بين متجهين
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export interface FaceMatch {
  person: Person | null;
  distance: number; // أقل = أفضل
  confidence: number; // 0..1
}

// عتبة الوجه القياسية في face-api: مسافة أقل من 0.6 تعني تطابق
const FACE_THRESHOLD = 0.55;

// مطابقة متجه وجه مع قاعدة الأشخاص (أقرب جار)
export function matchFace(descriptor: Float32Array, people: Person[]): FaceMatch {
  let best: Person | null = null;
  let bestDist = Infinity;

  for (const p of people) {
    for (const d of p.faceDescriptors) {
      const dist = euclidean(descriptor, d);
      if (dist < bestDist) {
        bestDist = dist;
        best = p;
      }
    }
  }

  if (!best || bestDist > FACE_THRESHOLD) {
    return { person: null, distance: bestDist, confidence: 0 };
  }
  // تحويل المسافة إلى ثقة تقريبية
  const confidence = Math.max(0, Math.min(1, 1 - bestDist / FACE_THRESHOLD));
  return { person: best, distance: bestDist, confidence };
}

export interface VoiceMatch {
  person: Person | null;
  similarity: number; // أعلى = أفضل
  confidence: number;
}

// عتبة تشابه الصوت
const VOICE_THRESHOLD = 0.82;

export function matchVoice(fingerprint: number[], people: Person[]): VoiceMatch {
  let best: Person | null = null;
  let bestSim = -Infinity;

  for (const p of people) {
    for (const vp of p.voicePrints) {
      const sim = cosineSimilarity(fingerprint, vp);
      if (sim > bestSim) {
        bestSim = sim;
        best = p;
      }
    }
  }

  if (!best || bestSim < VOICE_THRESHOLD) {
    return { person: null, similarity: bestSim, confidence: 0 };
  }
  const confidence = Math.max(
    0,
    Math.min(1, (bestSim - VOICE_THRESHOLD) / (1 - VOICE_THRESHOLD)),
  );
  return { person: best, similarity: bestSim, confidence };
}

export { FACE_THRESHOLD, VOICE_THRESHOLD };
