import { useCallback, useEffect, useRef, useState } from 'react';

interface Options {
  video?: boolean;
  audio?: boolean;
}

// خطاف لإدارة تدفق الكاميرا/الميكروفون بأمان مع التنظيف التلقائي
export function useMediaStream({ video = true, audio = false }: Options) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);

  const start = useCallback(async () => {
    setError(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: video ? { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } : false,
        audio,
      });
      streamRef.current = s;
      setStream(s);
      setActive(true);
    } catch (e: any) {
      const name = e?.name || '';
      if (name === 'NotAllowedError')
        setError('تم رفض الإذن. يرجى السماح بالوصول للكاميرا/الميكروفون.');
      else if (name === 'NotFoundError')
        setError('لم يتم العثور على كاميرا أو ميكروفون.');
      else setError('تعذّر تشغيل الكاميرا/الميكروفون: ' + (e?.message || name));
    }
  }, [video, audio]);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStream(null);
    setActive(false);
  }, []);

  useEffect(() => () => stop(), [stop]);

  return { stream, error, active, start, stop };
}
