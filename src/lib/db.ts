import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

// ===== نماذج البيانات =====
export interface Person {
  id: string;
  name: string;
  note?: string;
  createdAt: number;
  updatedAt: number;
  // صورة مصغّرة للعرض (data URL)
  photo?: string;
  // متجهات الوجه: كل عيّنة متجه 128 بُعد
  faceDescriptors: number[][];
  // بصمة الصوت: متوسط متجه ميزات MFCC، وقد تكون فارغة
  voicePrints: number[][];
}

interface RecogDB extends DBSchema {
  people: {
    key: string;
    value: Person;
    indexes: { 'by-name': string };
  };
}

let dbPromise: Promise<IDBPDatabase<RecogDB>> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<RecogDB>('el-ghaba-recognition', 1, {
      upgrade(db) {
        const store = db.createObjectStore('people', { keyPath: 'id' });
        store.createIndex('by-name', 'name');
      },
    });
  }
  return dbPromise;
}

export async function getAllPeople(): Promise<Person[]> {
  const db = await getDB();
  const all = await db.getAll('people');
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getPerson(id: string): Promise<Person | undefined> {
  const db = await getDB();
  return db.get('people', id);
}

export async function savePerson(person: Person): Promise<void> {
  const db = await getDB();
  await db.put('people', person);
}

export async function deletePerson(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('people', id);
}

export async function clearAll(): Promise<void> {
  const db = await getDB();
  await db.clear('people');
}

export function newId(): string {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  );
}

// تصدير/استيراد قاعدة البيانات كاملة (نسخة احتياطية)
export async function exportAll(): Promise<string> {
  const people = await getAllPeople();
  return JSON.stringify({ version: 1, exportedAt: Date.now(), people }, null, 2);
}

export async function importAll(json: string, merge = true): Promise<number> {
  const data = JSON.parse(json) as { people: Person[] };
  if (!Array.isArray(data.people)) throw new Error('ملف غير صالح');
  const db = await getDB();
  if (!merge) await db.clear('people');
  const tx = db.transaction('people', 'readwrite');
  for (const p of data.people) {
    await tx.store.put(p);
  }
  await tx.done;
  return data.people.length;
}
