import { useEffect, useRef, useState } from 'react';
import { useMediaStream } from '../hooks/useMediaStream';
import { detectAllFacesFast, isFaceReady, loadFaceModels } from '../lib/face';
import { bufferToFingerprint, recordAudio } from '../lib/voice';
import { matchFace, matchVoice, type VoiceCandidate } from '../lib/match';
import { getAllPeople, type Person } from '../lib/db';
import { FaceTracker, type Detection, type Track, type Box } from '../lib/tracker';
import { useI18n } from '../i18n';

const VOICE_SECONDS = 5;
const TARGET_KEY = 'falcon-target';

// ألوان الواجهة السينمائية
const C_TARGET = '#3dff88'; // قفل الهدف (أخضر ليزري)
const C_KNOWN = '#22d3ee'; // شخص معروف
const C_UNKNOWN = '#fbbf24'; // وجه غير معروف
const C_HUD = '#22d3ee';

interface Props {
  toast: (m: string) => void;
}

export default function RecognizePage({ toast }: Props) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const peopleRef = useRef<Person[]>([]);
  const targetRef = useRef<string | null>(localStorage.getItem(TARGET_KEY));
  const trackerRef = useRef(new FaceTracker());
  const tracksRef = useRef<Track[]>([]);
  const dispRef = useRef<Map<number, Box>>(new Map());
  const runningRef = useRef(false);
  const mirrorRef = useRef(true);

  const { stream, error, active, facing, start, stop, flip } = useMediaStream({
    video: true,
    audio: true,
    facingMode: 'user',
  });

  const [modelsLoading, setModelsLoading] = useState(!isFaceReady());
  const [people, setPeople] = useState<Person[]>([]);
  const [targetId, setTargetId] = useState<string | null>(targetRef.current);
  const [fps, setFps] = useState(0);
  const [faceCount, setFaceCount] = useState(0);
  const [targetVisible, setTargetVisible] = useState(false);

  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceProgress, setVoiceProgress] = useState(0);
  const [voiceResult, setVoiceResult] = useState<{
    person: Person | null;
    confidence: number;
    candidates: VoiceCandidate[];
  } | null>(null);

  mirrorRef.current = facing === 'user';

  useEffect(() => {
    (async () => {
      const ppl = await getAllPeople();
      peopleRef.current = ppl;
      setPeople(ppl);
      await loadFaceModels().catch(() => toast(t('loading_models')));
      setModelsLoading(false);
      await start('user');
    })();
    return () => {
      runningRef.current = false;
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    targetRef.current = targetId;
    if (targetId) localStorage.setItem(TARGET_KEY, targetId);
    else localStorage.removeItem(TARGET_KEY);
    trackerRef.current.reset();
  }, [targetId]);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  }, [stream]);

  // ===== حلقة الكشف (أبطأ) =====
  useEffect(() => {
    if (modelsLoading || !active) return;
    runningRef.current = true;
    let frames = 0;
    let lastTs = performance.now();

    const detectLoop = async () => {
      if (!runningRef.current) return;
      const video = videoRef.current;
      if (video && video.videoWidth > 0) {
        try {
          const faces = await detectAllFacesFast(video);
          const target = targetRef.current;
          const detections: Detection[] = faces.map((f) => {
            const m = matchFace(f.descriptor, peopleRef.current);
            const personId = m.person ? m.person.id : null;
            return {
              box: f.box,
              descriptor: f.descriptor,
              name: m.person ? m.person.name : t('unknown'),
              personId,
              matched: !!m.person,
              confidence: m.confidence,
              isTarget: !!target && personId === target,
            };
          });
          const tracks = trackerRef.current.update(detections);
          tracksRef.current = tracks;
          setFaceCount(tracks.filter((tr) => tr.misses === 0).length);
          setTargetVisible(tracks.some((tr) => tr.isTarget && tr.misses === 0));

          frames++;
          const now = performance.now();
          if (now - lastTs > 1000) {
            setFps(Math.round((frames * 1000) / (now - lastTs)));
            frames = 0;
            lastTs = now;
          }
        } catch {
          /* تجاهل أخطاء الإطار */
        }
      }
      if (runningRef.current) requestAnimationFrame(() => detectLoop());
    };
    detectLoop();

    return () => {
      runningRef.current = false;
    };
  }, [modelsLoading, active, t]);

  // ===== حلقة الرسم (60 إطار/ث لواجهة ناعمة) =====
  useEffect(() => {
    let raf = 0;
    const render = () => {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (canvas && video && video.videoWidth > 0) {
        if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
        if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
        drawHud(canvas, tracksRef.current, dispRef.current, mirrorRef.current, {
          hasTarget: !!targetRef.current,
          targetVisible: tracksRef.current.some((tr) => tr.isTarget && tr.misses === 0),
          scanning: t('rec_scanning'),
          acquired: t('rec_acquired'),
          searching: t('rec_searching'),
        });
      }
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [t]);

  async function listenVoice() {
    if (!stream || voiceBusy) return;
    if (peopleRef.current.every((p) => p.voicePrints.length === 0)) {
      toast(t('rec_no_voice_match'));
      return;
    }
    setVoiceBusy(true);
    setVoiceProgress(0);
    setVoiceResult(null);
    try {
      const buffer = await recordAudio(stream, VOICE_SECONDS * 1000, setVoiceProgress);
      const fp = bufferToFingerprint(buffer);
      if (!fp) {
        toast(t('enr_voice_insufficient'));
        return;
      }
      const m = matchVoice(fp.fingerprint, peopleRef.current);
      setVoiceResult({ person: m.person, confidence: m.confidence, candidates: m.candidates });
    } catch (e: any) {
      toast('' + (e?.message || ''));
    } finally {
      setVoiceBusy(false);
      setVoiceProgress(0);
    }
  }

  return (
    <div>
      <h2 className="section">🎯 {t('rec_title')}</h2>

      {people.length === 0 && (
        <div className="match-banner miss">
          <div>
            <div className="big">{t('rec_no_people')}</div>
            <div className="sub">{t('rec_no_people_hint')}</div>
          </div>
        </div>
      )}

      {/* اختيار الهدف */}
      <div className="card" style={{ padding: 12 }}>
        <label className="lbl" style={{ marginTop: 0 }}>
          🔎 {t('rec_target_label')}
        </label>
        <div className="row">
          <select
            className="field"
            style={{ flex: 1 }}
            value={targetId ?? ''}
            onChange={(e) => setTargetId(e.target.value || null)}
          >
            <option value="">{t('rec_target_all')}</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button className="btn secondary" onClick={() => flip()} disabled={!active} title={t('rec_flip')}>
            🔄 {facing === 'user' ? t('rec_front') : t('rec_back')}
          </button>
        </div>
      </div>

      <div className="card">
        <div className={`video-wrap ${targetVisible ? 'target-lock' : ''}`}>
          <video ref={videoRef} autoPlay playsInline muted className={facing === 'user' ? 'mirror' : ''} />
          <canvas ref={canvasRef} />
          {(modelsLoading || !active) && (
            <div className="loading-overlay">
              <div className="spinner" />
              <span>{modelsLoading ? t('loading_models') : t('loading_camera')}</span>
            </div>
          )}
        </div>
        {error && <p className="muted" style={{ color: 'var(--danger)' }}>{error}</p>}
        <div className="row between" style={{ marginTop: 10 }}>
          <span className="pill">👥 {t('rec_db')}: {people.length}</span>
          <span className="pill">🙂 {faceCount} {t('rec_faces')}</span>
          <span className="pill">⚡ {fps} {t('rec_fps')}</span>
        </div>
      </div>

      {/* التعرّف بالصوت */}
      <div className="card">
        <h2 className="section">🎙️ {t('rec_voice_title')}</h2>
        {voiceResult && (
          <>
            <div className={`match-banner ${voiceResult.person ? 'hit' : 'miss'}`}>
              {voiceResult.person?.photo && <img src={voiceResult.person.photo} alt="" />}
              <div>
                <div className="big">
                  {voiceResult.person ? voiceResult.person.name : t('rec_unknown_voice')}
                </div>
                <div className="sub">
                  {voiceResult.person
                    ? `${t('rec_confidence')}: ${Math.round(voiceResult.confidence * 100)}%`
                    : t('rec_no_voice_match')}
                </div>
              </div>
            </div>
            {voiceResult.candidates.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div className="muted" style={{ marginBottom: 6 }}>{t('rec_candidates')}</div>
                {voiceResult.candidates.map((c, i) => {
                  const pct = Math.round(Math.max(0, Math.min(1, (c.similarity + 1) / 2)) * 100);
                  return (
                    <div key={c.person.id} style={{ marginBottom: 6 }}>
                      <div className="row between" style={{ marginBottom: 2 }}>
                        <span style={{ fontSize: 13 }}>{i + 1}. {c.person.name}</span>
                        <span className="muted" style={{ fontSize: 12 }}>{pct}%</span>
                      </div>
                      <div className="progress">
                        <div style={{ width: `${pct}%`, background: i === 0 ? 'var(--accent-2)' : 'var(--border)' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
        <button className="btn secondary block" onClick={listenVoice} disabled={voiceBusy || !active}>
          {voiceBusy ? `🎙️ ${t('rec_listening')} ${Math.round(voiceProgress * 100)}%` : `🎙️ ${t('rec_listen')} (${VOICE_SECONDS}s)`}
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

// ============ رسم الواجهة السينمائية ============
interface HudLabels {
  hasTarget: boolean;
  targetVisible: boolean;
  scanning: string;
  acquired: string;
  searching: string;
}

function drawHud(
  canvas: HTMLCanvasElement,
  tracks: Track[],
  disp: Map<number, Box>,
  mirror: boolean,
  labels: HudLabels,
) {
  const ctx = canvas.getContext('2d')!;
  const W = canvas.width;
  const H = canvas.height;
  const now = performance.now();
  const S = W / 640; // معامل قياس
  ctx.clearRect(0, 0, W, H);

  const fx = (b: Box) => (mirror ? W - (b.x + b.width) : b.x);

  // ===== إطار HUD عام =====
  drawFrameCorners(ctx, W, H, S);
  // خط المسح المتحرك
  const scanY = (Math.sin(now / 1400) * 0.5 + 0.5) * H;
  const grad = ctx.createLinearGradient(0, scanY - 30 * S, 0, scanY + 30 * S);
  grad.addColorStop(0, 'rgba(34,211,238,0)');
  grad.addColorStop(0.5, 'rgba(34,211,238,0.35)');
  grad.addColorStop(1, 'rgba(34,211,238,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, scanY - 30 * S, W, 60 * S);
  ctx.strokeStyle = 'rgba(34,211,238,0.6)';
  ctx.lineWidth = 1 * S;
  ctx.beginPath();
  ctx.moveTo(0, scanY);
  ctx.lineTo(W, scanY);
  ctx.stroke();

  // شريط الحالة العلوي
  const blink = Math.sin(now / 400) > 0;
  let statusText = labels.scanning;
  let statusColor = C_HUD;
  if (labels.hasTarget) {
    if (labels.targetVisible) {
      statusText = '◉ ' + labels.acquired;
      statusColor = C_TARGET;
    } else {
      statusText = labels.searching;
      statusColor = C_UNKNOWN;
    }
  }
  ctx.font = `700 ${Math.round(15 * S)}px monospace`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  // نقطة تسجيل حمراء
  if (blink) {
    ctx.fillStyle = '#ff3b3b';
    ctx.beginPath();
    ctx.arc(16 * S, 20 * S, 5 * S, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#ff3b3b';
  ctx.fillText('REC', 28 * S, 12 * S);
  ctx.fillStyle = statusColor;
  ctx.textAlign = 'right';
  ctx.fillText(statusText, W - 16 * S, 12 * S);
  // الوقت
  ctx.fillStyle = 'rgba(226,232,240,0.7)';
  ctx.textAlign = 'left';
  ctx.fillText(new Date().toLocaleTimeString(), 16 * S, 32 * S);

  // ===== المسارات =====
  for (const tr of tracks) {
    // إطار عرض منعّم
    let d = disp.get(tr.id);
    if (!d) {
      d = { ...tr.sbox };
      disp.set(tr.id, d);
    }
    const k = 0.3;
    d.x += (tr.sbox.x - d.x) * k;
    d.y += (tr.sbox.y - d.y) * k;
    d.width += (tr.sbox.width - d.width) * k;
    d.height += (tr.sbox.height - d.height) * k;

    const x = fx(d);
    const y = d.y;
    const w = d.width;
    const h = d.height;

    const color = tr.isTarget ? C_TARGET : tr.matched ? C_KNOWN : C_UNKNOWN;
    const fade = tr.misses > 0 ? 0.4 : 1;
    ctx.globalAlpha = fade;

    if (tr.isTarget) {
      drawTargetLock(ctx, x, y, w, h, S, now);
    } else {
      drawBrackets(ctx, x, y, w, h, color, 2.5 * S, Math.min(w, h) * 0.25);
      // مستطيل خافت
      ctx.strokeStyle = color + '55';
      ctx.lineWidth = 1 * S;
      ctx.strokeRect(x, y, w, h);
    }

    // شارة الاسم
    const label = tr.matched ? tr.name : tr.name;
    const conf = tr.matched ? ` ${Math.round(tr.confidence * 100)}%` : '';
    drawLabel(ctx, x, y, w, h, label + conf, color, S, tr.isTarget);
    ctx.globalAlpha = 1;
  }

  // تنظيف مسارات العرض القديمة
  const alive = new Set(tracks.map((t) => t.id));
  for (const id of disp.keys()) if (!alive.has(id)) disp.delete(id);
}

function drawFrameCorners(ctx: CanvasRenderingContext2D, W: number, H: number, S: number) {
  const len = 26 * S;
  const m = 8 * S;
  ctx.strokeStyle = 'rgba(34,211,238,0.5)';
  ctx.lineWidth = 2 * S;
  // نرسم الزوايا الأربع يدوياً
  const c = (mx: number, my: number, dx: number, dy: number) => {
    ctx.beginPath();
    ctx.moveTo(mx + dx * len, my);
    ctx.lineTo(mx, my);
    ctx.lineTo(mx, my + dy * len);
    ctx.stroke();
  };
  c(m, m, 1, 1);
  c(W - m, m, -1, 1);
  c(m, H - m, 1, -1);
  c(W - m, H - m, -1, -1);
}

function drawBrackets(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  lw: number,
  len: number,
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  const seg = (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) => {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x3, y3);
    ctx.stroke();
  };
  seg(x, y + len, x, y, x + len, y);
  seg(x + w - len, y, x + w, y, x + w, y + len);
  seg(x, y + h - len, x, y + h, x + len, y + h);
  seg(x + w - len, y + h, x + w, y + h, x + w, y + h - len);
}

function drawTargetLock(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  S: number,
  now: number,
) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const pulse = Math.sin(now / 200) * 0.5 + 0.5;
  // أقواس سميكة نابضة
  drawBrackets(ctx, x, y, w, h, C_TARGET, (3 + pulse * 2) * S, Math.min(w, h) * 0.3);
  // دائرة استهداف دوّارة
  const r = Math.max(w, h) * 0.62;
  ctx.strokeStyle = C_TARGET;
  ctx.lineWidth = 2 * S;
  ctx.setLineDash([6 * S, 8 * S]);
  ctx.lineDashOffset = -now / 40;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  // تصالب مركزي
  ctx.strokeStyle = C_TARGET + 'aa';
  ctx.lineWidth = 1 * S;
  ctx.beginPath();
  ctx.moveTo(cx, y - 14 * S);
  ctx.lineTo(cx, y + h + 14 * S);
  ctx.moveTo(x - 14 * S, cy);
  ctx.lineTo(x + w + 14 * S, cy);
  ctx.stroke();
}

function drawLabel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  text: string,
  color: string,
  S: number,
  emphasize: boolean,
) {
  const fs = Math.round((emphasize ? 16 : 14) * S);
  ctx.font = `700 ${fs}px system-ui, sans-serif`;
  const padX = 8 * S;
  const tw = ctx.measureText(text).width;
  const bw = tw + padX * 2;
  const bh = fs + 8 * S;
  // أسفل الإطار إن وُجدت مساحة، وإلا أعلاه
  let by = y + h + 4 * S;
  if (by + bh > ctx.canvas.height) by = y - bh - 4 * S;
  if (by < 0) by = y + 4 * S;
  let bx = x + w / 2 - bw / 2;
  bx = Math.max(2 * S, Math.min(ctx.canvas.width - bw - 2 * S, bx));

  ctx.fillStyle = 'rgba(2,10,20,0.82)';
  roundRect(ctx, bx, by, bw, bh, 5 * S);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5 * S;
  roundRect(ctx, bx, by, bw, bh, 5 * S);
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, bx + padX, by + bh / 2 + 1 * S);
  ctx.textBaseline = 'top';
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
