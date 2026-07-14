import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Lang = 'ar' | 'en' | 'fr';

export const LANGS: { code: Lang; label: string; dir: 'rtl' | 'ltr' }[] = [
  { code: 'ar', label: 'العربية', dir: 'rtl' },
  { code: 'en', label: 'English', dir: 'ltr' },
  { code: 'fr', label: 'Français', dir: 'ltr' },
];

type Dict = Record<string, string>;

const ar: Dict = {
  appName: 'عين الصقر',
  tagline: 'التعرّف على الأشخاص وتتبّعهم — يعمل بالكامل في متصفحك.',

  nav_recognize: 'تتبّع',
  nav_enroll: 'تسجيل',
  nav_people: 'الأشخاص',

  gate_subtitle: 'نظام التعرّف والتتبّع · خاص',
  gate_placeholder: 'أدخل كلمة المرور',
  gate_enter: 'دخول',
  gate_wrong: 'كلمة المرور غير صحيحة',
  gate_privacy: 'بياناتك (الوجوه والأصوات) تبقى على جهازك فقط ولا تُرفع لأي خادم.',

  rec_title: 'التتبّع المباشر',
  rec_target_label: 'الهدف المطلوب',
  rec_target_all: 'تتبّع الجميع',
  rec_searching: 'جارٍ البحث…',
  rec_acquired: 'تم تحديد الهدف',
  rec_scanning: 'مسح…',
  rec_db: 'قاعدة البيانات',
  rec_fps: 'إطار/ث',
  rec_faces: 'وجوه',
  rec_no_people: 'لا يوجد أشخاص مسجّلون',
  rec_no_people_hint: 'انتقل إلى تبويب «تسجيل» لإضافة أشخاص أولاً.',
  rec_voice_title: 'التعرّف بالصوت',
  rec_listen: 'استمع وتعرّف',
  rec_listening: 'يستمع…',
  rec_unknown_voice: 'صوت غير معروف',
  rec_no_voice_match: 'لا يوجد تطابق واثق',
  rec_confidence: 'الثقة',
  rec_candidates: 'أقرب المرشّحين:',
  rec_flip: 'قلب الكاميرا',
  rec_front: 'أمامية',
  rec_back: 'خلفية',
  rec_fullscreen: 'ملء الشاشة',
  rec_exit: 'خروج',
  rec_settings: 'إعدادات',
  rec_sensitivity: 'حساسية التعرّف',
  rec_sens_strict: 'أدقّ',
  rec_sens_loose: 'أوسع',
  rec_alert_sound: 'صوت تنبيه عند العثور على الهدف',
  rec_auto_snap: 'لقطة تلقائية عند القفل',
  rec_lock_color: 'لون قفل الهدف',
  rec_snapshot: 'لقطة الهدف',
  rec_snap_now: 'التقاط لقطة',
  rec_download: 'تنزيل',
  rec_close: 'إغلاق',

  unknown: 'غير معروف',

  enr_title: 'تسجيل شخص جديد',
  enr_mode_camera: 'بالكاميرا',
  enr_mode_photo: 'من صورة / بطاقة',
  enr_capture_face: 'التقاط عيّنة وجه',
  enr_record_voice: 'تسجيل الصوت',
  enr_recording: 'يسجّل…',
  enr_face_samples: 'عيّنات الوجه',
  enr_voice_prints: 'بصمات الصوت',
  enr_name: 'الاسم',
  enr_name_ph: 'مثال: أحمد محمد',
  enr_note: 'ملاحظة (اختياري)',
  enr_note_ph: 'مثال: قسم المبيعات · رقم الهوية',
  enr_save: 'حفظ الشخص',
  enr_tip: 'التقط 3–5 عيّنات وجه بزوايا مختلفة، وسجّل الصوت 2–3 مرات في مكان هادئ لدقة أعلى.',
  enr_saved: 'تم حفظ الشخص: ',
  enr_need_data: 'التقط عيّنة وجه أو سجّل الصوت أولاً',
  enr_need_name: 'يرجى إدخال الاسم',
  enr_no_face: 'لم يتم اكتشاف وجه واضح. اقترب من الكاميرا.',
  enr_face_ok: 'تم التقاط عيّنة الوجه ✓',
  enr_voice_low: 'تم التسجيل لكن جودة الصوت منخفضة — تحدّث أعلى في مكان أهدأ.',
  enr_voice_ok: 'تم تسجيل بصمة الصوت ✓',
  enr_voice_insufficient: 'الصوت غير كافٍ. تحدّث بوضوح لعدة ثوانٍ.',
  enr_from_photo: 'اختر صورة (أو صوّر بطاقة الهوية)',
  enr_photo_hint: 'ارفع صورة واضحة للوجه — يمكن أن تكون صورة بطاقة هوية أو صورة شخصية.',
  enr_no_face_photo: 'لم أعثر على وجه واضح في الصورة. جرّب صورة أوضح.',
  enr_photo_ok: 'تم استخراج الوجه من الصورة ✓',

  ppl_title: 'الأشخاص المسجّلون',
  ppl_export: 'تصدير نسخة',
  ppl_import: 'استيراد',
  ppl_delete_all: 'حذف الكل',
  ppl_empty: 'لا يوجد أشخاص بعد.',
  ppl_empty_hint: 'استخدم تبويب «تسجيل» لإضافة أشخاص.',
  ppl_delete: 'حذف',
  ppl_set_target: 'تعيين كهدف',
  ppl_target_set: 'تم تعيين الهدف: ',
  ppl_confirm_delete: 'حذف «{name}»؟',
  ppl_confirm_clear: 'حذف جميع الأشخاص نهائياً؟',
  ppl_imported: 'تم استيراد {n} شخص',
  ppl_exported: 'تم تصدير نسخة احتياطية',
  ppl_deleted: 'تم الحذف',
  ppl_loading: 'جارٍ التحميل…',

  loading_models: 'جارٍ تحميل النماذج…',
  loading_camera: 'جارٍ تشغيل الكاميرا…',
};

const en: Dict = {
  appName: 'FALCON EYE',
  tagline: 'Recognize and track people — runs entirely in your browser.',

  nav_recognize: 'Track',
  nav_enroll: 'Enroll',
  nav_people: 'People',

  gate_subtitle: 'Recognition & Tracking System · Private',
  gate_placeholder: 'Enter password',
  gate_enter: 'Enter',
  gate_wrong: 'Incorrect password',
  gate_privacy: 'Your data (faces & voices) stays on your device and is never uploaded.',

  rec_title: 'Live Tracking',
  rec_target_label: 'Target',
  rec_target_all: 'Track everyone',
  rec_searching: 'Searching…',
  rec_acquired: 'TARGET ACQUIRED',
  rec_scanning: 'SCANNING…',
  rec_db: 'Database',
  rec_fps: 'FPS',
  rec_faces: 'faces',
  rec_no_people: 'No enrolled people',
  rec_no_people_hint: 'Go to the "Enroll" tab to add people first.',
  rec_voice_title: 'Voice Recognition',
  rec_listen: 'Listen & identify',
  rec_listening: 'Listening…',
  rec_unknown_voice: 'Unknown voice',
  rec_no_voice_match: 'No confident match',
  rec_confidence: 'Confidence',
  rec_candidates: 'Closest candidates:',
  rec_flip: 'Flip camera',
  rec_front: 'Front',
  rec_back: 'Back',
  rec_fullscreen: 'Fullscreen',
  rec_exit: 'Exit',
  rec_settings: 'Settings',
  rec_sensitivity: 'Recognition sensitivity',
  rec_sens_strict: 'Strict',
  rec_sens_loose: 'Loose',
  rec_alert_sound: 'Alert sound when target is found',
  rec_auto_snap: 'Auto snapshot on lock',
  rec_lock_color: 'Target lock color',
  rec_snapshot: 'Target snapshot',
  rec_snap_now: 'Take snapshot',
  rec_download: 'Download',
  rec_close: 'Close',

  unknown: 'UNKNOWN',

  enr_title: 'Enroll a new person',
  enr_mode_camera: 'Camera',
  enr_mode_photo: 'From photo / ID',
  enr_capture_face: 'Capture face sample',
  enr_record_voice: 'Record voice',
  enr_recording: 'Recording…',
  enr_face_samples: 'Face samples',
  enr_voice_prints: 'Voice prints',
  enr_name: 'Name',
  enr_name_ph: 'e.g. John Smith',
  enr_note: 'Note (optional)',
  enr_note_ph: 'e.g. Sales dept · ID number',
  enr_save: 'Save person',
  enr_tip: 'Capture 3–5 face samples from different angles, and record voice 2–3 times in a quiet place for best accuracy.',
  enr_saved: 'Person saved: ',
  enr_need_data: 'Capture a face sample or record voice first',
  enr_need_name: 'Please enter a name',
  enr_no_face: 'No clear face detected. Move closer to the camera.',
  enr_face_ok: 'Face sample captured ✓',
  enr_voice_low: 'Recorded, but voice quality is low — speak louder in a quieter place.',
  enr_voice_ok: 'Voice print recorded ✓',
  enr_voice_insufficient: 'Not enough voice. Speak clearly for a few seconds.',
  enr_from_photo: 'Choose an image (or photograph an ID card)',
  enr_photo_hint: 'Upload a clear face photo — can be an ID card photo or a portrait.',
  enr_no_face_photo: 'No clear face found in the image. Try a clearer photo.',
  enr_photo_ok: 'Face extracted from image ✓',

  ppl_title: 'Enrolled people',
  ppl_export: 'Export backup',
  ppl_import: 'Import',
  ppl_delete_all: 'Delete all',
  ppl_empty: 'No people yet.',
  ppl_empty_hint: 'Use the "Enroll" tab to add people.',
  ppl_delete: 'Delete',
  ppl_set_target: 'Set as target',
  ppl_target_set: 'Target set: ',
  ppl_confirm_delete: 'Delete "{name}"?',
  ppl_confirm_clear: 'Permanently delete all people?',
  ppl_imported: 'Imported {n} people',
  ppl_exported: 'Backup exported',
  ppl_deleted: 'Deleted',
  ppl_loading: 'Loading…',

  loading_models: 'Loading models…',
  loading_camera: 'Starting camera…',
};

const fr: Dict = {
  appName: 'FALCON EYE',
  tagline: 'Reconnaître et suivre des personnes — 100 % dans votre navigateur.',

  nav_recognize: 'Suivi',
  nav_enroll: 'Ajouter',
  nav_people: 'Personnes',

  gate_subtitle: 'Système de reconnaissance et de suivi · Privé',
  gate_placeholder: 'Entrez le mot de passe',
  gate_enter: 'Entrer',
  gate_wrong: 'Mot de passe incorrect',
  gate_privacy: 'Vos données (visages et voix) restent sur votre appareil et ne sont jamais envoyées.',

  rec_title: 'Suivi en direct',
  rec_target_label: 'Cible',
  rec_target_all: 'Suivre tout le monde',
  rec_searching: 'Recherche…',
  rec_acquired: 'CIBLE ACQUISE',
  rec_scanning: 'ANALYSE…',
  rec_db: 'Base',
  rec_fps: 'IPS',
  rec_faces: 'visages',
  rec_no_people: 'Aucune personne enregistrée',
  rec_no_people_hint: 'Allez dans l’onglet « Ajouter » pour ajouter des personnes.',
  rec_voice_title: 'Reconnaissance vocale',
  rec_listen: 'Écouter et identifier',
  rec_listening: 'Écoute…',
  rec_unknown_voice: 'Voix inconnue',
  rec_no_voice_match: 'Aucune correspondance sûre',
  rec_confidence: 'Confiance',
  rec_candidates: 'Candidats les plus proches :',
  rec_flip: 'Changer de caméra',
  rec_front: 'Avant',
  rec_back: 'Arrière',
  rec_fullscreen: 'Plein écran',
  rec_exit: 'Quitter',
  rec_settings: 'Réglages',
  rec_sensitivity: 'Sensibilité de reconnaissance',
  rec_sens_strict: 'Stricte',
  rec_sens_loose: 'Large',
  rec_alert_sound: 'Alerte sonore quand la cible est trouvée',
  rec_auto_snap: 'Capture auto au verrouillage',
  rec_lock_color: 'Couleur du verrou de cible',
  rec_snapshot: 'Capture de la cible',
  rec_snap_now: 'Prendre une capture',
  rec_download: 'Télécharger',
  rec_close: 'Fermer',

  unknown: 'INCONNU',

  enr_title: 'Ajouter une personne',
  enr_mode_camera: 'Caméra',
  enr_mode_photo: 'Depuis photo / pièce',
  enr_capture_face: 'Capturer le visage',
  enr_record_voice: 'Enregistrer la voix',
  enr_recording: 'Enregistrement…',
  enr_face_samples: 'Échantillons visage',
  enr_voice_prints: 'Empreintes vocales',
  enr_name: 'Nom',
  enr_name_ph: 'ex. Jean Dupont',
  enr_note: 'Note (facultatif)',
  enr_note_ph: 'ex. Service ventes · N° pièce',
  enr_save: 'Enregistrer',
  enr_tip: 'Capturez 3–5 échantillons de visage sous différents angles, et enregistrez la voix 2–3 fois dans un endroit calme.',
  enr_saved: 'Personne enregistrée : ',
  enr_need_data: 'Capturez un visage ou enregistrez la voix d’abord',
  enr_need_name: 'Veuillez saisir un nom',
  enr_no_face: 'Aucun visage net détecté. Rapprochez-vous.',
  enr_face_ok: 'Échantillon de visage capturé ✓',
  enr_voice_low: 'Enregistré, mais qualité faible — parlez plus fort dans un endroit calme.',
  enr_voice_ok: 'Empreinte vocale enregistrée ✓',
  enr_voice_insufficient: 'Voix insuffisante. Parlez clairement quelques secondes.',
  enr_from_photo: 'Choisir une image (ou photographier une pièce d’identité)',
  enr_photo_hint: 'Importez une photo nette du visage — pièce d’identité ou portrait.',
  enr_no_face_photo: 'Aucun visage net trouvé dans l’image. Essayez une photo plus nette.',
  enr_photo_ok: 'Visage extrait de l’image ✓',

  ppl_title: 'Personnes enregistrées',
  ppl_export: 'Exporter',
  ppl_import: 'Importer',
  ppl_delete_all: 'Tout supprimer',
  ppl_empty: 'Aucune personne pour l’instant.',
  ppl_empty_hint: 'Utilisez l’onglet « Ajouter ».',
  ppl_delete: 'Supprimer',
  ppl_set_target: 'Définir comme cible',
  ppl_target_set: 'Cible définie : ',
  ppl_confirm_delete: 'Supprimer « {name} » ?',
  ppl_confirm_clear: 'Supprimer définitivement toutes les personnes ?',
  ppl_imported: '{n} personnes importées',
  ppl_exported: 'Sauvegarde exportée',
  ppl_deleted: 'Supprimé',
  ppl_loading: 'Chargement…',

  loading_models: 'Chargement des modèles…',
  loading_camera: 'Démarrage de la caméra…',
};

const DICTS: Record<Lang, Dict> = { ar, en, fr };

interface I18nCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  dir: 'rtl' | 'ltr';
}

const Ctx = createContext<I18nCtx | null>(null);

const LANG_KEY = 'falcon-lang';

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = localStorage.getItem(LANG_KEY) as Lang | null;
    return saved && DICTS[saved] ? saved : 'ar';
  });

  const dir = LANGS.find((l) => l.code === lang)!.dir;

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
    localStorage.setItem(LANG_KEY, lang);
  }, [lang, dir]);

  const t = (key: string, vars?: Record<string, string | number>) => {
    let s = DICTS[lang][key] ?? DICTS.en[key] ?? key;
    if (vars) for (const k in vars) s = s.replace(`{${k}}`, String(vars[k]));
    return s;
  };

  return <Ctx.Provider value={{ lang, setLang: setLangState, t, dir }}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useI18n outside provider');
  return c;
}
