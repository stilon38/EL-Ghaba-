import { useEffect, useRef, useState } from 'react';
import {
  clearAll,
  deletePerson,
  exportAll,
  getAllPeople,
  importAll,
  type Person,
} from '../lib/db';

interface Props {
  toast: (m: string) => void;
  refreshKey: number;
}

export default function PeoplePage({ toast, refreshKey }: Props) {
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
    if (!confirm(`حذف «${p.name}»؟`)) return;
    await deletePerson(p.id);
    toast('تم الحذف');
    load();
  }

  async function handleClear() {
    if (!confirm('حذف جميع الأشخاص نهائياً؟')) return;
    await clearAll();
    toast('تم حذف الجميع');
    load();
  }

  async function handleExport() {
    const json = await exportAll();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `el-ghaba-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('تم تصدير نسخة احتياطية');
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const n = await importAll(text, true);
      toast(`تم استيراد ${n} شخص`);
      load();
    } catch (err: any) {
      toast('فشل الاستيراد: ' + (err?.message || ''));
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div>
      <div className="row between">
        <h2 className="section">👥 الأشخاص المسجّلون ({people.length})</h2>
      </div>

      <div className="card">
        <div className="row">
          <button className="btn secondary" onClick={handleExport}>⬇️ تصدير نسخة</button>
          <button className="btn secondary" onClick={() => fileRef.current?.click()}>⬆️ استيراد</button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            style={{ display: 'none' }}
            onChange={handleImport}
          />
          {people.length > 0 && (
            <button className="btn danger" onClick={handleClear}>🗑️ حذف الكل</button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="empty">جارٍ التحميل…</div>
      ) : people.length === 0 ? (
        <div className="empty">
          لا يوجد أشخاص بعد.<br />
          استخدم تبويب «تسجيل» لإضافة أشخاص.
        </div>
      ) : (
        <div className="people-grid">
          {people.map((p) => (
            <div className="person-card" key={p.id}>
              {p.photo ? (
                <img src={p.photo} alt={p.name} />
              ) : (
                <div
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: '50%',
                    background: 'var(--bg-2)',
                    margin: '0 auto 8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 30,
                  }}
                >
                  🙂
                </div>
              )}
              <div className="name">{p.name}</div>
              <div className="meta">
                👤 {p.faceDescriptors.length} · 🔊 {p.voicePrints.length}
                {p.note ? <><br />{p.note}</> : null}
              </div>
              <button className="btn danger" onClick={() => handleDelete(p)} style={{ padding: '6px 12px', fontSize: 13 }}>
                حذف
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
