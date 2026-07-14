import { LANGS, useI18n } from '../i18n';

// مبدّل اللغة (عربي / إنجليزي / فرنسي)
export default function LangSwitcher() {
  const { lang, setLang } = useI18n();
  return (
    <div className="lang-switch" role="group" aria-label="language">
      {LANGS.map((l) => (
        <button
          key={l.code}
          className={l.code === lang ? 'active' : ''}
          onClick={() => setLang(l.code)}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
