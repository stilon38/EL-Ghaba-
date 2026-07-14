import { useEffect, useRef, useState } from 'react';
import { useMediaStream } from '../hooks/useMediaStream';
import { detectAllFaces, isFaceReady, loadFaceModels } from '../lib/face';
import { bufferToFingerprint, recordAudio } from '../lib/voice';
import { matchFace, matchVoice } from '../lib/match';
import { getAllPeople, type Person } from '../lib/db';

const VOICE_SECONDS = 4;

interface Props {
  toast: (m: string) => void;
}

interface LiveLabel {
  name: string;
  confidence: number;
  box: { x: number; y: number; width: number; height: number };
  matched: boolean;
}

export default function RecognizePage({ toast }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const peopleRef = useRef<Person[]>([]);
  const runningRef = useRef(false);

  const { stream, error, active, start, stop } = useMediaStream({ video: true, audio: true });
  const [modelsLoading, setModelsLoading] = useState(!isFaceReady());
  const [peopleCount, setPeopleCount] = useState(0);
  const [fps, setFps] = useState(0);

  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceProgress, setVoiceProgress] = useState(0);
  const [voiceResult, setVoiceResult] = useState<{ person: Person | null; confidence: number } | null>(null);

  useEffect(() => {
    (async () => {
      peopleRef.current = await getAllPeople();
      setPeopleCount(peopleRef.current.length);
      await loadFaceModels().catch(() => toast('تعذّر تحميل النماذج'));
      setModelsLoading(false);
      await start();
    })();
    return () => {
      runningRef.current = false;
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  }, [stream]);

  // حلقة التعرّف على الوجوه
  useEffect(() => {
    if (modelsLoading || !active) return;
    runningRef.current = true;
    let frames = 0;
    let lastTs = performance.now();

    const loop = async () => {
      if (!runningRef.current) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.videoWidth > 0) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        try {
          const faces = await detectAllFaces(video);
          const labels: LiveLabel[] = faces.map((f) => {
            const m = matchFace(f.descriptor, peopleRef.current);
            return {
              name: m.person ? m.person.name : 'غير معروف',
              confidence: m.confidence,
              box: f.box,
              matched: !!m.person,
            };
          });
          drawOverlay(canvas, labels);
        } catch {
          /* تجاهل أخطاء الإطار المؤقتة */
        }

        frames++;
        const now = performance.now();
        if (now - lastTs > 1000) {
          setFps(Math.round((frames * 1000) / (now - lastTs)));
          frames = 0;
          lastTs = now;
        }
      }
      if (runningRef.current) requestAnimationFrame(() => loop());
    };
    loop();

    return () => {
      runningRef.current = false;
    };
  }, [modelsLoading, active]);

  function drawOverlay(canvas: HTMLCanvasElement, labels: LiveLabel[]) {
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const l of labels) {
      const { x, y, width, height } = l.box;
      const color = l.matched ? '#34d399' : '#fbbf24';
      ctx.lineWidth = Math.max(2, canvas.width / 200);
      ctx.strokeStyle = color;
      ctx.strokeRect(x, y, width, height);

      // نص الاسم (نعكسه أفقياً لأن الفيديو معكوس بالـ CSS)
      const text = l.matched ? `${l.name} ${Math.round(l.confidence * 100)}%` : l.name;
      const fontSize = Math.max(16, canvas.width / 28);
      ctx.font = `700 ${fontSize}px system-ui, sans-serif`;
      const tw = ctx.measureText(text).width;
      const pad = 6;
      ctx.save();
      ctx.translate(x + width, y > fontSize + 12 ? y : y + height);
      ctx.scale(-1, 1);
      ctx.fillStyle = color;
      const boxY = y > fontSize + 12 ? -(fontSize + pad * 2) : pad;
      ctx.fillRect(0, boxY, tw + pad * 2, fontSize + pad * 2);
      ctx.fillStyle = '#06222b';
      ctx.fillText(text, pad, boxY + fontSize + pad / 2);
      ctx.restore();
    }
  }

  async function listenVoice() {
    if (!stream || voiceBusy) return;
    if (peopleRef.current.every((p) => p.voicePrints.length === 0)) {
      toast('لا توجد بصمات صوت مسجّلة بعد.');
      return;
    }
    setVoiceBusy(true);
    setVoiceProgress(0);
    setVoiceResult(null);
    try {
      const buffer = await recordAudio(stream, VOICE_SECONDS * 1000, setVoiceProgress);
      const fp = bufferToFingerprint(buffer);
      if (!fp) {
        toast('لم أسمع صوتاً واضحاً.');
        return;
      }
      const m = matchVoice(fp.fingerprint, peopleRef.current);
      setVoiceResult({ person: m.person, confidence: m.confidence });
    } catch (e: any) {
      toast('خطأ في التسجيل: ' + (e?.message || ''));
    } finally {
      setVoiceBusy(false);
      setVoiceProgress(0);
    }
  }

  return (
    <div>
      <h2 className="section">🔍 التعرّف المباشر</h2>

      {peopleCount === 0 && (
        <div className="match-banner miss">
          <div>
            <div className="big">لا يوجد أشخاص مسجّلون</div>
            <div className="sub">انتقل إلى تبويب «تسجيل» لإضافة أشخاص أولاً.</div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="video-wrap">
          <video ref={videoRef} autoPlay playsInline muted />
          <canvas ref={canvasRef} />
          {(modelsLoading || !active) && (
            <div className="loading-overlay">
              <div className="spinner" />
              <span>{modelsLoading ? 'جارٍ تحميل النماذج…' : 'جارٍ تشغيل الكاميرا…'}</span>
            </div>
          )}
        </div>
        {error && <p className="muted" style={{ color: 'var(--danger)' }}>{error}</p>}
        <div className="row between" style={{ marginTop: 10 }}>
          <span className="pill">👥 قاعدة البيانات: {peopleCount}</span>
          <span className="pill">⚡ {fps} إطار/ث</span>
        </div>
      </div>

      <div className="card">
        <h2 className="section">🎙️ التعرّف بالصوت</h2>
        {voiceResult && (
          <div className={`match-banner ${voiceResult.person ? 'hit' : 'miss'}`}>
            {voiceResult.person?.photo && <img src={voiceResult.person.photo} alt="" />}
            <div>
              <div className="big">
                {voiceResult.person ? voiceResult.person.name : 'صوت غير معروف'}
              </div>
              <div className="sub">
                {voiceResult.person
                  ? `الثقة: ${Math.round(voiceResult.confidence * 100)}%`
                  : 'لا يوجد تطابق ضمن العتبة'}
              </div>
            </div>
          </div>
        )}
        <button className="btn secondary block" onClick={listenVoice} disabled={voiceBusy || !active}>
          {voiceBusy ? `🎙️ يستمع… ${Math.round(voiceProgress * 100)}%` : `🎙️ استمع وتعرّف (${VOICE_SECONDS} ث)`}
        </button>
        {voiceBusy && (
          <div className="progress" style={{ marginTop: 10 }}>
            <div style={{ width: `${voiceProgress * 100}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}
