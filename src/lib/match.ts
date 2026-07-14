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

export interface VoiceCandidate {
  person: Person;
  similarity: number; // أعلى = أفضل (في الفضاء المُوحّد)
}

export interface VoiceMatch {
  person: Person | null;
  similarity: number; // أعلى = أفضل
  confidence: number;
  margin: number; // الفارق بين المرشّح الأول والثاني
  candidates: VoiceCandidate[]; // أفضل المرشّحين مرتّبين
}

// عتبة تشابه الصوت (في الفضاء المُوحّد z-normalized؛ تشابه جيب التمام)
const VOICE_THRESHOLD = 0.5;
// أدنى فارق مطلوب بين المرشّح الأول والثاني لقبول التطابق بثقة عند وجود عدة أشخاص
const VOICE_MIN_MARGIN = 0.06;

// معيار توحيد قياسي عام: متوسط وانحراف كل بُعد عبر كل بصمات الأشخاص
interface Standardizer {
  mean: number[];
  std: number[];
  dim: number;
}

function buildStandardizer(prints: number[][], dim: number): Standardizer {
  const mean = new Array(dim).fill(0);
  const std = new Array(dim).fill(1);
  if (prints.length < 2) return { mean: new Array(dim).fill(0), std, dim };
  for (const v of prints) for (let i = 0; i < dim; i++) mean[i] += v[i];
  for (let i = 0; i < dim; i++) mean[i] /= prints.length;
  const varr = new Array(dim).fill(0);
  for (const v of prints) for (let i = 0; i < dim; i++) varr[i] += (v[i] - mean[i]) ** 2;
  for (let i = 0; i < dim; i++) std[i] = Math.sqrt(varr[i] / prints.length) || 1;
  return { mean, std, dim };
}

function standardize(v: number[], s: Standardizer): number[] {
  const out = new Array(s.dim);
  for (let i = 0; i < s.dim; i++) out[i] = (v[i] - s.mean[i]) / (s.std[i] + 1e-6);
  return out;
}

// مطابقة بصمة صوت مع قاعدة الأشخاص باستخدام:
// 1) توحيد قياسي عام (z-normalization) يُبرز الأبعاد المميِّزة بين المتحدثين
// 2) أفضل تطابق لكل شخص (أقرب جار) 3) ثقة قائمة على الهامش بين المرشّحين
export function matchVoice(fingerprint: number[], people: Person[]): VoiceMatch {
  const dim = fingerprint.length;

  // نجمع فقط البصمات المطابقة لطول بصمة الاستعلام (توافق الإصدارات)
  const compatible: { person: Person; print: number[] }[] = [];
  const pool: number[][] = [];
  for (const p of people) {
    for (const vp of p.voicePrints) {
      if (vp.length === dim) {
        compatible.push({ person: p, print: vp });
        pool.push(vp);
      }
    }
  }

  const empty: VoiceMatch = {
    person: null,
    similarity: -Infinity,
    confidence: 0,
    margin: 0,
    candidates: [],
  };
  if (compatible.length === 0) return empty;

  // بناء معيار التوحيد من البصمات المُسجّلة فقط (بدون الاستعلام)،
  // كي لا يتشوّه الفضاء عند وجود عدد قليل جداً من العيّنات
  const std = buildStandardizer(pool, dim);
  const q = standardize(fingerprint, std);

  // أفضل تشابه لكل شخص
  const bestPerPerson = new Map<string, { person: Person; sim: number }>();
  for (const { person, print } of compatible) {
    const sim = cosineSimilarity(q, standardize(print, std));
    const cur = bestPerPerson.get(person.id);
    if (!cur || sim > cur.sim) bestPerPerson.set(person.id, { person, sim });
  }

  const ranked = [...bestPerPerson.values()].sort((a, b) => b.sim - a.sim);
  const candidates: VoiceCandidate[] = ranked
    .slice(0, 3)
    .map((r) => ({ person: r.person, similarity: r.sim }));

  const top = ranked[0];
  const second = ranked[1];
  const margin = second ? top.sim - second.sim : top.sim;

  // القبول: التشابه فوق العتبة، والهامش كافٍ عند وجود منافسين
  const accepted = top.sim >= VOICE_THRESHOLD && (!second || margin >= VOICE_MIN_MARGIN);
  if (!accepted) {
    return { person: null, similarity: top.sim, confidence: 0, margin, candidates };
  }

  // الثقة = مزيج من القوة المطلقة وحجم الهامش
  const strength = Math.min(1, Math.max(0, (top.sim - VOICE_THRESHOLD) / (1 - VOICE_THRESHOLD)));
  const marginFactor = second ? Math.min(1, margin / 0.2) : 1;
  const confidence = Math.max(0.05, strength * (0.5 + 0.5 * marginFactor));

  return { person: top.person, similarity: top.sim, confidence, margin, candidates };
}

export { FACE_THRESHOLD, VOICE_THRESHOLD };
