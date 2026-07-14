import { useCallback, useEffect, useRef, useState } from 'react';

export type Facing = 'user' | 'environment';

interface Options {
  video?: boolean;
  audio?: boolean;
  facingMode?: Facing;
}

// خطاف لإدارة تدفق الكاميرا/الميكروفون مع دعم التبديل بين الأمامية والخلفية
export function useMediaStream({ video = true, audio = false, facingMode = 'user' }: Options) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(false);
  const [facing, setFacing] = useState<Facing>(facingMode);
  const streamRef = useRef<MediaStream | null>(null);

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(
    async (f: Facing = facing) => {
      setError(null);
      stopTracks();
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: video
            ? { facingMode: { ideal: f }, width: { ideal: 1280 }, height: { ideal: 720 } }
            : false,
          audio,
        });
        streamRef.current = s;
        setStream(s);
        setActive(true);
        setFacing(f);
      } catch (e: any) {
        const name = e?.name || '';
        if (name === 'NotAllowedError')
          setError('تم رفض الإذن. يرجى السماح بالوصول للكاميرا/الميكروفون.');
        else if (name === 'NotFoundError') setError('لم يتم العثور على كاميرا أو ميكروفون.');
        else setError('تعذّر تشغيل الكاميرا/الميكروفون: ' + (e?.message || name));
      }
    },
    [video, audio, facing, stopTracks],
  );

  const stop = useCallback(() => {
    stopTracks();
    setStream(null);
    setActive(false);
  }, [stopTracks]);

  // التبديل بين الكاميرا الأمامية والخلفية
  const flip = useCallback(async () => {
    const next: Facing = facing === 'user' ? 'environment' : 'user';
    await start(next);
  }, [facing, start]);

  useEffect(() => () => stop(), [stop]);

  return { stream, error, active, facing, start, stop, flip };
}
