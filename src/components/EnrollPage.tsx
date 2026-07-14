import { useEffect, useRef, useState } from 'react';
import { useMediaStream } from '../hooks/useMediaStream';
import { detectSingleFace, isFaceReady, loadFaceModels } from '../lib/face';
import { bufferToFingerprint, recordAudio } from '../lib/voice';
import { newId, savePerson, type Person } from '../lib/db';

const MIN_FACE_SAMPLES = 1;
const VOICE_SECONDS = 5;

interface Props {
  onSaved: () => void;
  toast: (m: string) => void;
}

export default function EnrollPage({ onSaved, toast }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { stream, error, active, start, stop } = useMediaStream({ video: true, audio: true });

  const [modelsLoading, setModelsLoading] = useState(!isFaceReady());
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const [faceDescriptors, setFaceDescriptors] = useState<number[][]>([]);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [photo, setPhoto] = useState<string | undefined>();

  const [voicePrints, setVoicePrints] = useState<number[][]>([]);
  const [recording, setRecording] = useState(false);
  const [recProgress, setRecProgress] = useState(0);

  useEffect(() => {
    loadFaceModels().then(() => setModelsLoading(false)).catch(() => {
      toast('تعذّر تحميل نماذج التعرّف على الوجه');
    });
    start();
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  }, [stream]);

  async function captureFace() {
    const video = videoRef.current;
    if (!video || modelsLoading) return;
    setBusy(true);
    try {
      const face = await detectSingleFace(video);
      if (!face) {
        toast('لم يتم اكتشاف وجه واضح. اقترب من الكاميرا.');
        return;
      }
      // قص الوجه لصورة مصغّرة
      const { x, y, width, height } = face.box;
      const pad = 0.25;
      const canvas = document.createElement('canvas');
      const size = 128;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      const sx = Math.max(0, x - width * pad);
      const sy = Math.max(0, y - height * pad);
      const sw = Math.min(video.videoWidth - sx, width * (1 + pad * 2));
      const sh = Math.min(video.videoHeight - sy, height * (1 + pad * 2));
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, size, size);
      const thumb = canvas.toDataURL('image/jpeg', 0.8);

      setFaceDescriptors((d) => [...d, Array.from(face.descriptor)]);
      setThumbs((t) => [...t, thumb]);
      if (!photo) setPhoto(thumb);
      toast('تم التقاط عيّنة الوجه ✓');
    } finally {
      setBusy(false);
    }
  }

  async function captureVoice() {
    if (!stream || recording) return;
    setRecording(true);
    setRecProgress(0);
    try {
      const buffer = await recordAudio(stream, VOICE_SECONDS * 1000, setRecProgress);
      const result = bufferToFingerprint(buffer);
      if (!result) {
        toast('الصوت غير كافٍ. تحدّث بوضوح لمدة ' + VOICE_SECONDS + ' ثوانٍ.');
        return;
      }
      setVoicePrints((v) => [...v, result.fingerprint]);
      if (result.voicedRatio < 0.3) {
        toast('تم التسجيل لكن جودة الصوت منخفضة — تحدّث أعلى في مكان أهدأ.');
      } else {
        toast(`تم تسجيل بصمة الصوت ✓ (جودة ${Math.round(result.voicedRatio * 100)}%)`);
      }
    } catch (e: any) {
      toast('تعذّر التسجيل: ' + (e?.message || ''));
    } finally {
      setRecording(false);
      setRecProgress(0);
    }
  }

  async function handleSave() {
    if (!name.trim()) {
      toast('يرجى إدخال الاسم');
      return;
    }
    if (faceDescriptors.length < MIN_FACE_SAMPLES && voicePrints.length === 0) {
      toast('التقط عيّنة وجه واحدة على الأقل أو سجّل الصوت');
      return;
    }
    const now = Date.now();
    const person: Person = {
      id: newId(),
      name: name.trim(),
      note: note.trim() || undefined,
      createdAt: now,
      updatedAt: now,
      photo,
      faceDescriptors,
      voicePrints,
    };
    await savePerson(person);
    toast('تم حفظ الشخص: ' + person.name);
    // إعادة التهيئة
    setName('');
    setNote('');
    setFaceDescriptors([]);
    setThumbs([]);
    setPhoto(undefined);
    setVoicePrints([]);
    onSaved();
  }

  return (
    <div>
      <h2 className="section">➕ تسجيل شخص جديد</h2>

      <div className="card">
        <div className="video-wrap">
          <video ref={videoRef} autoPlay playsInline muted />
          {(modelsLoading || !active) && (
            <div className="loading-overlay">
              <div className="spinner" />
              <span>{modelsLoading ? 'جارٍ تحميل نماذج الوجه…' : 'جارٍ تشغيل الكاميرا…'}</span>
            </div>
          )}
        </div>
        {error && <p className="muted" style={{ color: 'var(--danger)' }}>{error}</p>}

        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn green" onClick={captureFace} disabled={busy || modelsLoading || !active}>
            📸 التقاط عيّنة وجه
          </button>
          <button className="btn secondary" onClick={captureVoice} disabled={recording || !active}>
            {recording ? `🎙️ يسجّل… ${Math.round(recProgress * 100)}%` : '🎙️ تسجيل الصوت'}
          </button>
        </div>

        {recording && (
          <div className="progress" style={{ marginTop: 10 }}>
            <div style={{ width: `${recProgress * 100}%` }} />
          </div>
        )}

        <div className="row" style={{ marginTop: 12, gap: 8 }}>
          <span className={`pill ${faceDescriptors.length ? 'ok' : 'no'}`}>
            👤 عيّنات الوجه: {faceDescriptors.length}
          </span>
          <span className={`pill ${voicePrints.length ? 'ok' : 'no'}`}>
            🔊 بصمات الصوت: {voicePrints.length}
          </span>
        </div>

        {thumbs.length > 0 && (
          <div className="samples">
            {thumbs.map((t, i) => (
              <img key={i} src={t} alt={`عينة ${i + 1}`} />
            ))}
          </div>
        )}
        <p className="muted" style={{ marginTop: 10 }}>
          نصيحة: التقط 3–5 عيّنات وجه بزوايا وإضاءات مختلفة، وسجّل بصمة الصوت 2–3 مرات
          بجُمل مختلفة في مكان هادئ — كلما زادت العيّنات ارتفعت الدقة في التمييز بين الأشخاص.
        </p>
      </div>

      <div className="card">
        <label className="lbl">الاسم *</label>
        <input
          className="field"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="مثال: أحمد محمد"
        />
        <label className="lbl">ملاحظة (اختياري)</label>
        <input
          className="field"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="مثال: قسم المبيعات"
        />
        <button className="btn block" style={{ marginTop: 16 }} onClick={handleSave} disabled={busy}>
          💾 حفظ الشخص
        </button>
      </div>
    </div>
  );
}
