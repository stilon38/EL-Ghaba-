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
const SETTINGS_KEY = 'falcon-settings';

const C_KNOWN = '#22d3ee';
const C_UNKNOWN = '#fbbf24';
const LOCK_COLORS = ['#3dff88', '#ff3b6b', '#22d3ee', '#f5c518', '#b26bff'];

interface Settings {
  sensitivity: number; // عتبة المطابقة
  alertSound: boolean;
  autoSnap: boolean;
  lockColor: string;
}
const DEFAULT_SETTINGS: Settings = {
  sensitivity: 0.55,
  alertSound: true,
  autoSnap: true,
  lockColor: '#3dff88',
};

function loadSettings(): Settings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

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

  const [settings, setSettings] = useState<Settings>(loadSettings);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const prevAcquiredRef = useRef(false);
  const audioCtxRef = useRef<AudioContext | null>(null);

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
  const [fullscreen, setFullscreen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [snapshot, setSnapshot] = useState<string | null>(null);

  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceProgress, setVoiceProgress] = useState(0);
  const [voiceResult, setVoiceResult] = useState<{
    person: Person | null;
    confidence: number;
    candidates: VoiceCandidate[];
  } | null>(null);

  mirrorRef.current = facing === 'user';

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

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
      document.body.classList.remove('fs-active');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    targetRef.current = targetId;
    if (targetId) localStorage.setItem(TARGET_KEY, targetId);
    else localStorage.removeItem(TARGET_KEY);
    trackerRef.current.reset();
    prevAcquiredRef.current = false;
  }, [targetId]);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  }, [stream]);

  useEffect(() => {
    document.body.classList.toggle('fs-active', fullscreen);
  }, [fullscreen]);

  function beep() {
    try {
      const ac = audioCtxRef.current || (audioCtxRef.current = new AudioContext());
      if (ac.state === 'suspended') ac.resume();
      const t0 = ac.currentTime;
      [0, 0.18].forEach((off) => {
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.type = 'sine';
        o.frequency.value = 1046;
        o.connect(g);
        g.connect(ac.destination);
        g.gain.setValueAtTime(0.0001, t0 + off);
        g.gain.exponentialRampToValueAtTime(0.35, t0 + off + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + off + 0.15);
        o.start(t0 + off);
        o.stop(t0 + off + 0.16);
      });
    } catch {
      /* الصوت اختياري */
    }
  }

  function takeSnapshot(): string | null {
    const video = videoRef.current;
    const overlay = canvasRef.current;
    if (!video || !overlay || video.videoWidth === 0) return null;
    const c = document.createElement('canvas');
    c.width = video.videoWidth;
    c.height = video.videoHeight;
    const ctx = c.getContext('2d')!;
    if (mirrorRef.current) {
      ctx.translate(c.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, c.width, c.height);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(overlay, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.92);
  }

  function onTargetAcquired() {
    if (settingsRef.current.alertSound) beep();
    if (settingsRef.current.autoSnap) {
      const s = takeSnapshot();
      if (s) setSnapshot(s);
    }
  }

  // ===== حلقة الكشف =====
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
          const thr = settingsRef.current.sensitivity;
          const detections: Detection[] = faces.map((f) => {
            const m = matchFace(f.descriptor, peopleRef.current, thr);
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
          const acquired = tracks.some((tr) => tr.isTarget && tr.misses === 0);
          setTargetVisible(acquired);
          if (acquired && !prevAcquiredRef.current) onTargetAcquired();
          prevAcquiredRef.current = acquired;

          frames++;
          const now = performance.now();
          if (now - lastTs > 1000) {
            setFps(Math.round((frames * 1000) / (now - lastTs)));
            frames = 0;
            lastTs = now;
          }
        } catch {
          /* تجاهل */
        }
      }
      if (runningRef.current) requestAnimationFrame(() => detectLoop());
    };
    detectLoop();
    return () => {
      runningRef.current = false;
    };
  }, [modelsLoading, active, t]);

  // ===== حلقة الرسم =====
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
          lockColor: settingsRef.current.lockColor,
        });
      }
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [t]);

  async function toggleFullscreen() {
    const next = !fullscreen;
    setFullscreen(next);
    try {
      if (next && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen().catch(() => {});
      } else if (!next && document.fullscreenElement) {
        await document.exitFullscreen().catch(() => {});
      }
    } catch {
      /* iOS لا يدعم واجهة ملء الشاشة؛ نعتمد على الغطاء الثابت */
    }
  }

  function manualSnap() {
    const s = takeSnapshot();
    if (s) setSnapshot(s);
  }

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

  // ===== عناصر التحكم القابلة لإعادة الاستخدام =====
  const targetSelect = (
    <select
      className="field glass-select"
      value={targetId ?? ''}
      onChange={(e) => setTargetId(e.target.value || null)}
    >
      <option value="">{t('rec_target_all')}</option>
      {people.map((p) => (
        <option key={p.id} value={p.id}>{p.name}</option>
      ))}
    </select>
  );

  const flipBtn = (
    <button className="btn glass" onClick={() => flip()} disabled={!active} title={t('rec_flip')}>
      🔄 {facing === 'user' ? t('rec_front') : t('rec_back')}
    </button>
  );
  const snapBtn = (
    <button className="btn glass" onClick={manualSnap} disabled={!active} title={t('rec_snap_now')}>
      📸
    </button>
  );
  const settingsBtn = (
    <button className={`btn glass ${showSettings ? 'on' : ''}`} onClick={() => setShowSettings((s) => !s)} title={t('rec_settings')}>
      ⚙️
    </button>
  );
  const fsBtn = (
    <button className="btn glass" onClick={toggleFullscreen} title={t('rec_fullscreen')}>
      {fullscreen ? `✕ ${t('rec_exit')}` : `⛶ ${t('rec_fullscreen')}`}
    </button>
  );

  const statusChip = (() => {
    if (!targetRef.current) return <span className="status-chip scan">◎ {t('rec_scanning')}</span>;
    return targetVisible ? (
      <span className="status-chip lock">◉ {t('rec_acquired')}</span>
    ) : (
      <span className="status-chip search">⊙ {t('rec_searching')}</span>
    );
  })();

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

      {!fullscreen && (
        <div className="card">
          <label className="lbl" style={{ marginTop: 0 }}>🔎 {t('rec_target_label')}</label>
          <div className="row">
            <div style={{ flex: 1, minWidth: 140 }}>{targetSelect}</div>
            {flipBtn}
          </div>
        </div>
      )}

      <div className={`video-wrap ${fullscreen ? 'fs' : ''} ${targetVisible ? 'target-lock' : ''}`}>
        <video ref={videoRef} autoPlay playsInline muted className={facing === 'user' ? 'mirror' : ''} />
        <canvas ref={canvasRef} />
        {(modelsLoading || !active) && (
          <div className="loading-overlay">
            <div className="spinner" />
            <span>{modelsLoading ? t('loading_models') : t('loading_camera')}</span>
          </div>
        )}

        {/* شريط علوي عائم دائماً فوق الفيديو */}
        <div className="hud-top">
          {statusChip}
          <div className="hud-top-right">
            <span className="mini-pill">🙂 {faceCount}</span>
            <span className="mini-pill">⚡ {fps}</span>
          </div>
        </div>

        {/* أدوات عائمة في وضع ملء الشاشة */}
        {fullscreen && (
          <div className="hud-bottom">
            <div className="hud-target">{targetSelect}</div>
            <div className="hud-actions">
              {flipBtn}
              {snapBtn}
              {settingsBtn}
              {fsBtn}
            </div>
          </div>
        )}

        {/* لقطة الهدف كصورة مصغّرة عائمة */}
        {snapshot && (
          <div className="snap-float">
            <img src={snapshot} alt={t('rec_snapshot')} />
            <div className="snap-actions">
              <a className="btn green tiny" href={snapshot} download={`falcon-${Date.now()}.jpg`}>⬇️</a>
              <button className="btn glass tiny" onClick={() => setSnapshot(null)}>✕</button>
            </div>
          </div>
        )}
      </div>

      {!fullscreen && (
        <div className="card">
          <div className="row" style={{ gap: 8 }}>
            {fsBtn}
            {snapBtn}
            {settingsBtn}
          </div>
          <div className="row between" style={{ marginTop: 12 }}>
            <span className="pill">👥 {t('rec_db')}: {people.length}</span>
            <span className="pill">🙂 {faceCount} {t('rec_faces')}</span>
            <span className="pill">⚡ {fps} {t('rec_fps')}</span>
          </div>
          {error && <p className="muted" style={{ color: 'var(--danger)' }}>{error}</p>}
        </div>
      )}

      {/* لوحة الإعدادات */}
      {showSettings && (
        <div className="card settings-panel">
          <h2 className="section">⚙️ {t('rec_settings')}</h2>

          <label className="lbl">{t('rec_sensitivity')}</label>
          <input
            type="range"
            min={0.4}
            max={0.72}
            step={0.01}
            value={settings.sensitivity}
            onChange={(e) => setSettings((s) => ({ ...s, sensitivity: parseFloat(e.target.value) }))}
            className="slider"
          />
          <div className="row between muted" style={{ fontSize: 12 }}>
            <span>{t('rec_sens_strict')}</span>
            <span>{t('rec_sens_loose')}</span>
          </div>

          <label className="lbl">{t('rec_lock_color')}</label>
          <div className="row" style={{ gap: 8 }}>
            {LOCK_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setSettings((s) => ({ ...s, lockColor: c }))}
                className={`swatch ${settings.lockColor === c ? 'sel' : ''}`}
                style={{ background: c }}
                aria-label={c}
              />
            ))}
          </div>

          <label className="switch-row">
            <input
              type="checkbox"
              checked={settings.alertSound}
              onChange={(e) => setSettings((s) => ({ ...s, alertSound: e.target.checked }))}
            />
            <span>🔊 {t('rec_alert_sound')}</span>
          </label>
          <label className="switch-row">
            <input
              type="checkbox"
              checked={settings.autoSnap}
              onChange={(e) => setSettings((s) => ({ ...s, autoSnap: e.target.checked }))}
            />
            <span>📸 {t('rec_auto_snap')}</span>
          </label>
        </div>
      )}

      {/* التعرّف بالصوت */}
      {!fullscreen && (
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
      )}
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
  lockColor: string;
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
  const S = W / 640;
  ctx.clearRect(0, 0, W, H);
  const C_TARGET = labels.lockColor;

  const fx = (b: Box) => (mirror ? W - (b.x + b.width) : b.x);

  drawFrameCorners(ctx, W, H, S);
  const scanY = (Math.sin(now / 1400) * 0.5 + 0.5) * H;
  const grad = ctx.createLinearGradient(0, scanY - 30 * S, 0, scanY + 30 * S);
  grad.addColorStop(0, 'rgba(34,211,238,0)');
  grad.addColorStop(0.5, 'rgba(34,211,238,0.28)');
  grad.addColorStop(1, 'rgba(34,211,238,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, scanY - 30 * S, W, 60 * S);
  ctx.strokeStyle = 'rgba(34,211,238,0.5)';
  ctx.lineWidth = 1 * S;
  ctx.beginPath();
  ctx.moveTo(0, scanY);
  ctx.lineTo(W, scanY);
  ctx.stroke();

  for (const tr of tracks) {
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
    ctx.globalAlpha = tr.misses > 0 ? 0.4 : 1;

    if (tr.isTarget) {
      drawTargetLock(ctx, x, y, w, h, S, now, C_TARGET);
    } else {
      drawBrackets(ctx, x, y, w, h, color, 2.5 * S, Math.min(w, h) * 0.25);
      ctx.strokeStyle = color + '44';
      ctx.lineWidth = 1 * S;
      ctx.strokeRect(x, y, w, h);
    }
    const conf = tr.matched ? ` ${Math.round(tr.confidence * 100)}%` : '';
    drawLabel(ctx, x, y, w, h, tr.name + conf, color, S, tr.isTarget);
    ctx.globalAlpha = 1;
  }

  const alive = new Set(tracks.map((t) => t.id));
  for (const id of disp.keys()) if (!alive.has(id)) disp.delete(id);
}

function drawFrameCorners(ctx: CanvasRenderingContext2D, W: number, H: number, S: number) {
  const len = 26 * S;
  const m = 8 * S;
  ctx.strokeStyle = 'rgba(34,211,238,0.45)';
  ctx.lineWidth = 2 * S;
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
  x: number, y: number, w: number, h: number,
  color: string, lw: number, len: number,
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
  x: number, y: number, w: number, h: number,
  S: number, now: number, color: string,
) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const pulse = Math.sin(now / 200) * 0.5 + 0.5;
  drawBrackets(ctx, x, y, w, h, color, (3 + pulse * 2) * S, Math.min(w, h) * 0.3);
  const r = Math.max(w, h) * 0.62;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2 * S;
  ctx.setLineDash([6 * S, 8 * S]);
  ctx.lineDashOffset = -now / 40;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = color + 'aa';
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
  x: number, y: number, w: number, h: number,
  text: string, color: string, S: number, emphasize: boolean,
) {
  const fs = Math.round((emphasize ? 16 : 14) * S);
  ctx.font = `700 ${fs}px system-ui, sans-serif`;
  const padX = 8 * S;
  const tw = ctx.measureText(text).width;
  const bw = tw + padX * 2;
  const bh = fs + 8 * S;
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
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
