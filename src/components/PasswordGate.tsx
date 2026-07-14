import { useState, type ReactNode } from 'react';
import { APP_PASSWORD, UNLOCK_KEY } from '../config';
import { useI18n } from '../i18n';
import LangSwitcher from './LangSwitcher';

interface Props {
  children: ReactNode;
}

// بوابة كلمة مرور بسيطة على مستوى المتصفح.
export default function PasswordGate({ children }: Props) {
  const { t } = useI18n();
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
        <img className="gate-logo" src="./favicon.svg" alt="" />
        <h1>{t('appName')}</h1>
        <p className="muted">{t('gate_subtitle')}</p>
        <input
          className="field"
          type="password"
          autoFocus
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(false);
          }}
          placeholder={t('gate_placeholder')}
        />
        {error && <p className="gate-error">{t('gate_wrong')}</p>}
        <button className="btn block" type="submit">{t('gate_enter')}</button>
        <div style={{ marginTop: 16 }}>
          <LangSwitcher />
        </div>
        <p className="muted gate-note">{t('gate_privacy')}</p>
      </form>
    </div>
  );
}
