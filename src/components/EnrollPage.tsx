import { useEffect, useRef, useState } from 'react';
import { useMediaStream } from '../hooks/useMediaStream';
import { detectSingleFace, isFaceReady, loadFaceModels } from '../lib/face';
import { bufferToFingerprint, recordAudio } from '../lib/voice';
import { newId, savePerson, type Person } from '../lib/db';
import { useI18n } from '../i18n';

const VOICE_SECONDS = 5;
type Mode = 'camera' | 'photo';

interface Props {
  onSaved: () => void;
  toast: (m: string) => void;
}

export default function EnrollPage({ onSaved, toast }: Props) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { stream, error, active, facing, start, stop, flip } = useMediaStream({
    video: true,
    audio: true,
    facingMode: 'user',
  });

  const [mode, setMode] = useState<Mode>('camera');
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
    loadFaceModels().then(() => setModelsLoading(false)).catch(() => toast(t('loading_models')));
    start('user');
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  }, [stream]);

  function cropToThumb(
    src: HTMLVideoElement | HTMLImageElement,
    box: { x: number; y: number; width: number; height: number },
    naturalW: number,
    naturalH: number,
  ): string {
    const { x, y, width, height } = box;
    const pad = 0.25;
    const size = 160;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const sx = Math.max(0, x - width * pad);
    const sy = Math.max(0, y - height * pad);
    const sw = Math.min(naturalW - sx, width * (1 + pad * 2));
    const sh = Math.min(naturalH - sy, height * (1 + pad * 2));
    ctx.drawImage(src, sx, sy, sw, sh, 0, 0, size, size);
    return canvas.toDataURL('image/jpeg', 0.85);
  }

  async function captureFace() {
    const video = videoRef.current;
    if (!video || modelsLoading) return;
    setBusy(true);
    try {
      const face = await detectSingleFace(video);
      if (!face) {
        toast(t('enr_no_face'));
        return;
      }
      const thumb = cropToThumb(video, face.box, video.videoWidth, video.videoHeight);
      setFaceDescriptors((d) => [...d, Array.from(face.descriptor)]);
      setThumbs((tt) => [...tt, thumb]);
      if (!photo) setPhoto(thumb);
      toast(t('enr_face_ok'));
    } finally {
      setBusy(false);
    }
  }

  async function handlePhotoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (modelsLoading) {
      toast(t('loading_models'));
      return;
    }
    setBusy(true);
    try {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.src = url;
      await img.decode().catch(() => new Promise((r) => (img.onload = r)));
      const face = await detectSingleFace(img);
      if (!face) {
        toast(t('enr_no_face_photo'));
        URL.revokeObjectURL(url);
        return;
      }
      const thumb = cropToThumb(img, face.box, img.naturalWidth, img.naturalHeight);
      URL.revokeObjectURL(url);
      setFaceDescriptors((d) => [...d, Array.from(face.descriptor)]);
      setThumbs((tt) => [...tt, thumb]);
      if (!photo) setPhoto(thumb);
      toast(t('enr_photo_ok'));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
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
        toast(t('enr_voice_insufficient'));
        return;
      }
      setVoicePrints((v) => [...v, result.fingerprint]);
      toast(result.voicedRatio < 0.3 ? t('enr_voice_low') : t('enr_voice_ok'));
    } catch (e: any) {
      toast('' + (e?.message || ''));
    } finally {
      setRecording(false);
      setRecProgress(0);
    }
  }

  async function handleSave() {
    if (!name.trim()) {
      toast(t('enr_need_name'));
      return;
    }
    if (faceDescriptors.length === 0 && voicePrints.length === 0) {
      toast(t('enr_need_data'));
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
    toast(t('enr_saved') + person.name);
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
      <h2 className="section">➕ {t('enr_title')}</h2>

      {/* اختيار طريقة إدخال الوجه */}
      <div className="seg">
        <button className={mode === 'camera' ? 'active' : ''} onClick={() => setMode('camera')}>
          📷 {t('enr_mode_camera')}
        </button>
        <button className={mode === 'photo' ? 'active' : ''} onClick={() => setMode('photo')}>
          🪪 {t('enr_mode_photo')}
        </button>
      </div>

      <div className="card">
        {mode === 'camera' ? (
          <>
            <div className="video-wrap">
              <video ref={videoRef} autoPlay playsInline muted className={facing === 'user' ? 'mirror' : ''} />
              {(modelsLoading || !active) && (
                <div className="loading-overlay">
                  <div className="spinner" />
                  <span>{modelsLoading ? t('loading_models') : t('loading_camera')}</span>
                </div>
              )}
            </div>
            {error && <p className="muted" style={{ color: 'var(--danger)' }}>{error}</p>}
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn green" onClick={captureFace} disabled={busy || modelsLoading || !active}>
                📸 {t('enr_capture_face')}
              </button>
              <button className="btn secondary" onClick={() => flip()} disabled={!active}>
                🔄 {facing === 'user' ? t('rec_front') : t('rec_back')}
              </button>
            </div>
          </>
        ) : (
          <div className="photo-enroll">
            <p className="muted">{t('enr_photo_hint')}</p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: 'none' }}
              onChange={handlePhotoFile}
            />
            <button className="btn green block" onClick={() => fileRef.current?.click()} disabled={busy || modelsLoading}>
              🪪 {t('enr_from_photo')}
            </button>
          </div>
        )}

        {/* الصوت (مشترك) */}
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn secondary" onClick={captureVoice} disabled={recording || !active}>
            {recording ? `🎙️ ${t('enr_recording')} ${Math.round(recProgress * 100)}%` : `🎙️ ${t('enr_record_voice')}`}
          </button>
        </div>
        {recording && (
          <div className="progress" style={{ marginTop: 10 }}>
            <div style={{ width: `${recProgress * 100}%` }} />
          </div>
        )}

        <div className="row" style={{ marginTop: 12, gap: 8 }}>
          <span className={`pill ${faceDescriptors.length ? 'ok' : 'no'}`}>
            👤 {t('enr_face_samples')}: {faceDescriptors.length}
          </span>
          <span className={`pill ${voicePrints.length ? 'ok' : 'no'}`}>
            🔊 {t('enr_voice_prints')}: {voicePrints.length}
          </span>
        </div>

        {thumbs.length > 0 && (
          <div className="samples">
            {thumbs.map((tb, i) => (
              <img key={i} src={tb} alt={`${i + 1}`} />
            ))}
          </div>
        )}
        <p className="muted" style={{ marginTop: 10 }}>{t('enr_tip')}</p>
      </div>

      <div className="card">
        <label className="lbl">{t('enr_name')} *</label>
        <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('enr_name_ph')} />
        <label className="lbl">{t('enr_note')}</label>
        <input className="field" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('enr_note_ph')} />
        <button className="btn block" style={{ marginTop: 16 }} onClick={handleSave} disabled={busy}>
          💾 {t('enr_save')}
        </button>
      </div>
    </div>
  );
}
