import { useCallback, useRef, useState } from 'react';
import RecognizePage from './components/RecognizePage';
import EnrollPage from './components/EnrollPage';
import PeoplePage from './components/PeoplePage';

type Tab = 'recognize' | 'enroll' | 'people';

export default function App() {
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
        <img className="logo" src="./favicon.svg" alt="شعار" />
        <div>
          <h1>الغابة · التعرّف على الأشخاص</h1>
          <p>تعرّف على الوجوه والأصوات — يعمل بالكامل في متصفحك، بدون خادم.</p>
        </div>
      </header>

      {tab === 'recognize' && <RecognizePage key={`r-${refreshKey}`} toast={toast} />}
      {tab === 'enroll' && <EnrollPage onSaved={handleSaved} toast={toast} />}
      {tab === 'people' && <PeoplePage toast={toast} refreshKey={refreshKey} />}

      {toastMsg && <div className="toast">{toastMsg}</div>}

      <nav className="tabs">
        <button className={tab === 'recognize' ? 'active' : ''} onClick={() => setTab('recognize')}>
          <span className="ico">🔍</span>
          تعرّف
        </button>
        <button className={tab === 'enroll' ? 'active' : ''} onClick={() => setTab('enroll')}>
          <span className="ico">➕</span>
          تسجيل
        </button>
        <button className={tab === 'people' ? 'active' : ''} onClick={() => setTab('people')}>
          <span className="ico">👥</span>
          الأشخاص
        </button>
      </nav>
    </div>
  );
}
