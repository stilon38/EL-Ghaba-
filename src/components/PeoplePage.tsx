import { useEffect, useRef, useState } from 'react';
import {
  clearAll,
  deletePerson,
  exportAll,
  getAllPeople,
  importAll,
  type Person,
} from '../lib/db';
import { useI18n } from '../i18n';

const TARGET_KEY = 'falcon-target';

interface Props {
  toast: (m: string) => void;
  refreshKey: number;
  goTrack: () => void;
}

export default function PeoplePage({ toast, refreshKey, goTrack }: Props) {
  const { t } = useI18n();
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    setPeople(await getAllPeople());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [refreshKey]);

  async function handleDelete(p: Person) {
    if (!confirm(t('ppl_confirm_delete', { name: p.name }))) return;
    await deletePerson(p.id);
    toast(t('ppl_deleted'));
    load();
  }

  async function handleClear() {
    if (!confirm(t('ppl_confirm_clear'))) return;
    await clearAll();
    toast(t('ppl_deleted'));
    load();
  }

  function setTarget(p: Person) {
    localStorage.setItem(TARGET_KEY, p.id);
    toast(t('ppl_target_set') + p.name);
    goTrack();
  }

  async function handleExport() {
    const json = await exportAll();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `falcon-eye-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast(t('ppl_exported'));
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const n = await importAll(text, true);
      toast(t('ppl_imported', { n }));
      load();
    } catch (err: any) {
      toast('' + (err?.message || ''));
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div>
      <div className="row between">
        <h2 className="section">👥 {t('ppl_title')} ({people.length})</h2>
      </div>

      <div className="card">
        <div className="row">
          <button className="btn secondary" onClick={handleExport}>⬇️ {t('ppl_export')}</button>
          <button className="btn secondary" onClick={() => fileRef.current?.click()}>⬆️ {t('ppl_import')}</button>
          <input ref={fileRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={handleImport} />
          {people.length > 0 && (
            <button className="btn danger" onClick={handleClear}>🗑️ {t('ppl_delete_all')}</button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="empty">{t('ppl_loading')}</div>
      ) : people.length === 0 ? (
        <div className="empty">
          {t('ppl_empty')}<br />
          {t('ppl_empty_hint')}
        </div>
      ) : (
        <div className="people-grid">
          {people.map((p) => (
            <div className="person-card" key={p.id}>
              {p.photo ? (
                <img src={p.photo} alt={p.name} />
              ) : (
                <div className="person-noimg">🙂</div>
              )}
              <div className="name">{p.name}</div>
              <div className="meta">
                👤 {p.faceDescriptors.length} · 🔊 {p.voicePrints.length}
                {p.note ? <><br />{p.note}</> : null}
              </div>
              <div className="row" style={{ gap: 6, justifyContent: 'center' }}>
                <button className="btn green" onClick={() => setTarget(p)} style={{ padding: '6px 10px', fontSize: 12 }}>
                  🎯 {t('ppl_set_target')}
                </button>
                <button className="btn danger" onClick={() => handleDelete(p)} style={{ padding: '6px 10px', fontSize: 12 }}>
                  {t('ppl_delete')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
