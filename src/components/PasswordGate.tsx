import { useState, type ReactNode } from 'react';
import { APP_PASSWORD, UNLOCK_KEY } from '../config';

interface Props {
  children: ReactNode;
}

// بوابة كلمة مرور بسيطة على مستوى المتصفح.
// تمنع فتح التطبيق دون كلمة المرور، وتتذكّر الفتح طوال الجلسة.
export default function PasswordGate({ children }: Props) {
  const [unlocked, setUnlocked] = useState(
    () => sessionStorage.getItem(UNLOCK_KEY) === '1',
  );
  const [value, setValue] = useState('');
  const [error, setError] = useState(false);

  if (unlocked) return <>{children}</>;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (value === APP_PASSWORD) {
      sessionStorage.setItem(UNLOCK_KEY, '1');
      setUnlocked(true);
    } else {
      setError(true);
      setValue('');
    }
  }

  return (
    <div className="gate">
      <form className="gate-card" onSubmit={submit}>
        <img className="gate-logo" src="./favicon.svg" alt="شعار" />
        <h1>الغابة</h1>
        <p className="muted">التعرّف على الأشخاص · تطبيق خاص</p>
        <input
          className="field"
          type="password"
          inputMode="text"
          autoFocus
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(false);
          }}
          placeholder="أدخل كلمة المرور"
        />
        {error && <p className="gate-error">كلمة المرور غير صحيحة</p>}
        <button className="btn block" type="submit">
          دخول
        </button>
        <p className="muted gate-note">
          بياناتك (الوجوه والأصوات) تبقى على جهازك فقط ولا تُرفع لأي خادم.
        </p>
      </form>
    </div>
  );
}
