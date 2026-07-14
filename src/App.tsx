import { useCallback, useRef, useState } from 'react';
import RecognizePage from './components/RecognizePage';
import EnrollPage from './components/EnrollPage';
import PeoplePage from './components/PeoplePage';
import PasswordGate from './components/PasswordGate';
import LangSwitcher from './components/LangSwitcher';
import { I18nProvider, useI18n } from './i18n';

type Tab = 'recognize' | 'enroll' | 'people';

export default function App() {
  return (
    <I18nProvider>
      <PasswordGate>
        <MainApp />
      </PasswordGate>
    </I18nProvider>
  );
}

function MainApp() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('recognize');
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const toastTimer = useRef<number | null>(null);

  const toast = useCallback((m: string) => {
    setToastMsg(m);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(null), 2600);
  }, []);

  const handleSaved = useCallback(() => setRefreshKey((k) => k + 1), []);

  return (
    <div className="app">
      <header className="top">
        <img className="logo" src="./favicon.svg" alt="" />
        <div style={{ flex: 1 }}>
          <h1>🦅 {t('appName')}</h1>
          <p>{t('tagline')}</p>
        </div>
        <LangSwitcher />
      </header>

      {tab === 'recognize' && <RecognizePage key={`r-${refreshKey}`} toast={toast} />}
      {tab === 'enroll' && <EnrollPage onSaved={handleSaved} toast={toast} />}
      {tab === 'people' && (
        <PeoplePage toast={toast} refreshKey={refreshKey} goTrack={() => setTab('recognize')} />
      )}

      {toastMsg && <div className="toast">{toastMsg}</div>}

      <nav className="tabs">
        <button className={tab === 'recognize' ? 'active' : ''} onClick={() => setTab('recognize')}>
          <span className="ico">🎯</span>
          {t('nav_recognize')}
        </button>
        <button className={tab === 'enroll' ? 'active' : ''} onClick={() => setTab('enroll')}>
          <span className="ico">➕</span>
          {t('nav_enroll')}
        </button>
        <button className={tab === 'people' ? 'active' : ''} onClick={() => setTab('people')}>
          <span className="ico">👥</span>
          {t('nav_people')}
        </button>
      </nav>
    </div>
  );
}
