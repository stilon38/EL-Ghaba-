// متتبّع وجوه خفيف: يربط الاكتشافات بين الإطارات عبر تداخل المربّعات (IoU)
// فيمنح كل شخص مُعرّفاً ثابتاً يبقى ملتصقاً به وهو يتحرك بين الحشود،
// مع تنعيم حركة الإطار ليبدو التتبّع سلساً كأفلام هوليوود.

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Detection {
  box: Box;
  descriptor: Float32Array;
  name: string;
  personId: string | null;
  matched: boolean;
  confidence: number;
  isTarget: boolean;
}

export interface Track extends Detection {
  id: number;
  sbox: Box; // مربّع منعّم للعرض
  misses: number; // عدد الإطارات دون رؤية
  age: number; // عدد الإطارات منذ الظهور
  hits: number;
}

function iou(a: Box, b: Box): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.width * a.height + b.width * b.height - inter;
  return union > 0 ? inter / union : 0;
}

function lerpBox(a: Box, b: Box, t: number): Box {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    width: a.width + (b.width - a.width) * t,
    height: a.height + (b.height - a.height) * t,
  };
}

const IOU_THRESHOLD = 0.3;
const MAX_MISSES = 12; // نُبقي المسار حياً 12 إطاراً بعد اختفائه
const SMOOTH = 0.45;

export class FaceTracker {
  private tracks: Track[] = [];
  private nextId = 1;

  update(detections: Detection[]): Track[] {
    const usedDet = new Set<number>();

    // ربط كل مسار قائم بأفضل اكتشاف متاح
    for (const tr of this.tracks) {
      let best = -1;
      let bestIou = IOU_THRESHOLD;
      for (let i = 0; i < detections.length; i++) {
        if (usedDet.has(i)) continue;
        const s = iou(tr.sbox, detections[i].box);
        if (s > bestIou) {
          bestIou = s;
          best = i;
        }
      }
      if (best >= 0) {
        const d = detections[best];
        usedDet.add(best);
        tr.box = d.box;
        tr.sbox = lerpBox(tr.sbox, d.box, SMOOTH);
        tr.descriptor = d.descriptor;
        tr.name = d.name;
        tr.personId = d.personId;
        tr.matched = d.matched;
        tr.confidence = d.confidence;
        tr.isTarget = d.isTarget;
        tr.misses = 0;
        tr.hits++;
        tr.age++;
      } else {
        tr.misses++;
        tr.age++;
      }
    }

    // اكتشافات جديدة لم تُربط ← مسارات جديدة
    for (let i = 0; i < detections.length; i++) {
      if (usedDet.has(i)) continue;
      const d = detections[i];
      this.tracks.push({
        ...d,
        id: this.nextId++,
        sbox: { ...d.box },
        misses: 0,
        age: 0,
        hits: 1,
      });
    }

    // إزالة المسارات المفقودة طويلاً
    this.tracks = this.tracks.filter((t) => t.misses <= MAX_MISSES);

    // نعرض فقط المسارات المؤكّدة (ظهرت مرتين على الأقل) أو الظاهرة الآن
    return this.tracks.filter((t) => t.hits >= 2 || t.misses === 0);
  }

  reset() {
    this.tracks = [];
    this.nextId = 1;
  }
}
