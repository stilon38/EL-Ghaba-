import * as faceapi from '@vladmandic/face-api';

const MODEL_URL = './models';

let loadingPromise: Promise<void> | null = null;
let loaded = false;

export function isFaceReady() {
  return loaded;
}

// تحميل النماذج مرة واحدة فقط
export function loadFaceModels(): Promise<void> {
  if (loaded) return Promise.resolve();
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
    await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
    await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
    await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
    loaded = true;
  })();
  return loadingPromise;
}

// كاشف سريع (TinyFaceDetector) للتتبّع المباشر وفي الحشود
const tinyOptions = new faceapi.TinyFaceDetectorOptions({
  inputSize: 416,
  scoreThreshold: 0.4,
});

// كشف كل الوجوه بسرعة أعلى — مناسب للتتبّع الحيّ لعدة أشخاص
export async function detectAllFacesFast(
  input: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
): Promise<DetectedFace[]> {
  const results = await faceapi
    .detectAllFaces(input, tinyOptions)
    .withFaceLandmarks()
    .withFaceDescriptors();

  return results.map((r) => ({
    descriptor: r.descriptor,
    box: {
      x: r.detection.box.x,
      y: r.detection.box.y,
      width: r.detection.box.width,
      height: r.detection.box.height,
    },
  }));
}

export interface DetectedFace {
  descriptor: Float32Array;
  box: { x: number; y: number; width: number; height: number };
}

const detectorOptions = new faceapi.SsdMobilenetv1Options({
  minConfidence: 0.5,
});

// كشف كل الوجوه في عنصر فيديو/صورة مع استخراج المتجه المميّز لكل وجه
export async function detectAllFaces(
  input: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
): Promise<DetectedFace[]> {
  const results = await faceapi
    .detectAllFaces(input, detectorOptions)
    .withFaceLandmarks()
    .withFaceDescriptors();

  return results.map((r) => ({
    descriptor: r.descriptor,
    box: {
      x: r.detection.box.x,
      y: r.detection.box.y,
      width: r.detection.box.width,
      height: r.detection.box.height,
    },
  }));
}

// كشف وجه واحد فقط (الأوضح) — يُستخدم في التسجيل
export async function detectSingleFace(
  input: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
): Promise<DetectedFace | null> {
  const r = await faceapi
    .detectSingleFace(input, detectorOptions)
    .withFaceLandmarks()
    .withFaceDescriptor();
  if (!r) return null;
  return {
    descriptor: r.descriptor,
    box: {
      x: r.detection.box.x,
      y: r.detection.box.y,
      width: r.detection.box.width,
      height: r.detection.box.height,
    },
  };
}
