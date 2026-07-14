// ينسخ نماذج التعرّف على الوجه من حزمة face-api إلى public/models
// استخدام: npm run fetch-models
import { existsSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const src = join(root, 'node_modules', '@vladmandic', 'face-api', 'model');
const dest = join(root, 'public', 'models');

const NEEDED = [
  'tiny_face_detector_model',
  'ssd_mobilenetv1_model',
  'face_landmark_68_model',
  'face_recognition_model',
];

if (!existsSync(src)) {
  console.error('لم يتم العثور على مجلد النماذج. شغّل npm install أولاً.');
  process.exit(1);
}

mkdirSync(dest, { recursive: true });

const files = readdirSync(src);
let count = 0;
for (const f of files) {
  if (NEEDED.some((n) => f.startsWith(n))) {
    copyFileSync(join(src, f), join(dest, f));
    count++;
  }
}
console.log(`تم نسخ ${count} ملف نموذج إلى public/models`);
