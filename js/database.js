const DATABASE_NAME = 'PesoWiseDB';
const DATABASE_VERSION = 2;
const BACKUP_SCHEMA_VERSION = 1;
const BACKUP_STORE_NAME = 'autoBackups';
const BACKUP_RETENTION_DAYS = 7;

export const STORE_NAMES = [
  'transactions', 'budgets', 'savingsGoals', 'savingsActivities', 'categories', 'settings'
];

const DEFAULT_CATEGORIES = [
  ...['Food', 'Transportation', 'Housing', 'Utilities', 'Shopping', 'Healthcare', 'Education', 'Entertainment', 'Personal Care', 'Family', 'Other'].map(name => ({ id: `expense-${name.toLowerCase().replaceAll(' ', '-')}`, name, kind: 'expense', custom: false })),
  ...['Salary', 'Business', 'Freelance', 'Allowance', 'Investment', 'Gifts', 'Other'].map(name => ({ id: `income-${name.toLowerCase()}`, name, kind: 'income', custom: false }))
];

let databasePromise;

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Database request failed.'));
  });
}

function transactionComplete(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error || new Error('Database transaction was aborted.'));
    transaction.onerror = () => reject(transaction.error || new Error('Database transaction failed.'));
  });
}

export async function openDatabase() {
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        const tx = request.transaction;
        const definitions = {
          transactions: [['date', 'date'], ['type', 'type'], ['category', 'category'], ['month', 'month']],
          budgets: [['month', 'month'], ['category', 'category']],
          savingsGoals: [['createdAt', 'createdAt'], ['targetDate', 'targetDate']],
          savingsActivities: [['goalId', 'goalId'], ['date', 'date']],
          categories: [['kind', 'kind'], ['name', 'name']],
          settings: []
        };
        for (const [name, indexes] of Object.entries(definitions)) {
          const store = db.objectStoreNames.contains(name)
            ? tx.objectStore(name)
            : db.createObjectStore(name, { keyPath: name === 'settings' ? 'key' : 'id' });
          for (const [index, path] of indexes) {
            if (!store.indexNames.contains(index)) store.createIndex(index, path, { unique: false });
          }
        }
        if (!db.objectStoreNames.contains(BACKUP_STORE_NAME)) {
          const backups = db.createObjectStore(BACKUP_STORE_NAME, { keyPath: 'id' });
          backups.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => db.close();
        resolve(db);
      };
      request.onerror = () => reject(request.error || new Error('Unable to open local database.'));
      request.onblocked = () => reject(new Error('Close other PesoWise tabs, then try again.'));
    }).catch(error => {
      databasePromise = null;
      throw error;
    });
  }
  return databasePromise;
}

export async function initializeDatabase() {
  const db = await openDatabase();
  const tx = db.transaction(['categories', 'settings'], 'readwrite');
  const categories = tx.objectStore('categories');
  const settings = tx.objectStore('settings');

  // FIX: no awaits inside the live transaction — browsers (Safari, Firefox,
  // Android WebView) can auto-commit it during an await, which made the
  // category seeding below throw TransactionInactiveError and silently skip
  // seeding. All reads/writes are now chained via request callbacks inside
  // the same transaction.
  const countRequest = categories.count();
  countRequest.onsuccess = () => {
    if (!countRequest.result) DEFAULT_CATEGORIES.forEach(category => categories.put(category));
  };

  for (const [key, value] of Object.entries({
    savingsLinked: false,
    currency: 'PHP',
    budgetAlertThreshold: 80,
    weekStartsOn: 1
  })) {
    const getRequest = settings.get(key);
    getRequest.onsuccess = () => {
      if (!getRequest.result) settings.put({ key, value });
    };
  }

  await transactionComplete(tx);
  await recordAutomaticSnapshot(db);
  return db;
}

async function recordAutomaticSnapshot(db) {
  try {
    const readTx = db.transaction(STORE_NAMES, 'readonly');
    const readDone = transactionComplete(readTx);
    const records = await Promise.all(STORE_NAMES.map(async name => [name, await requestResult(readTx.objectStore(name).getAll())]));
    await readDone;

    const createdAt = Date.now();
    const backupTx = db.transaction(BACKUP_STORE_NAME, 'readwrite');
    const backupDone = transactionComplete(backupTx);
    const backups = backupTx.objectStore(BACKUP_STORE_NAME);
    const snapshot = {
      id: new Date(createdAt).toISOString().slice(0, 10),
      createdAt,
      schemaVersion: BACKUP_SCHEMA_VERSION,
      data: Object.fromEntries(records)
    };
    const writeRequest = requestResult(backups.put(snapshot));
    const allBackups = await requestResult(backups.getAll());
    allBackups.sort((a, b) => b.createdAt - a.createdAt);
    const deleteRequests = allBackups.slice(BACKUP_RETENTION_DAYS).map(backup => requestResult(backups.delete(backup.id)));
    await Promise.all([writeRequest, backupDone, ...deleteRequests]);
  } catch (error) {
    console.warn('Automatic local backup could not be updated.', error);
  }
}

export async function getAll(storeName) {
  const db = await openDatabase();
  return requestResult(db.transaction(storeName, 'readonly').objectStore(storeName).getAll());
}

export async function getById(storeName, id) {
  const db = await openDatabase();
  return requestResult(db.transaction(storeName, 'readonly').objectStore(storeName).get(id));
}

export async function putRecord(storeName, record) {
  const db = await openDatabase();
  const tx = db.transaction(storeName, 'readwrite');
  const done = transactionComplete(tx);
  await Promise.all([requestResult(tx.objectStore(storeName).put(record)), done]);
  await recordAutomaticSnapshot(db);
  return record;
}

export async function deleteRecord(storeName, id) {
  const db = await openDatabase();
  const tx = db.transaction(storeName, 'readwrite');
  const done = transactionComplete(tx);
  await Promise.all([requestResult(tx.objectStore(storeName).delete(id)), done]);
  await recordAutomaticSnapshot(db);
}

export async function getSetting(key, fallback = null) {
  const record = await getById('settings', key);
  return record ? record.value : fallback;
}

export async function setSetting(key, value) {
  return putRecord('settings', { key, value });
}

export async function exportAllData() {
  const entries = await Promise.all(STORE_NAMES.map(async name => [name, await getAll(name)]));
  return {
    app: 'PesoWise',
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data: Object.fromEntries(entries)
  };
}

export async function replaceAllData(data) {
  const db = await openDatabase();
  const tx = db.transaction(STORE_NAMES, 'readwrite');
  const done = transactionComplete(tx);
  for (const name of STORE_NAMES) {
    const store = tx.objectStore(name);
    store.clear();
    for (const record of data[name]) store.put(record);
  }
  await done;
  await recordAutomaticSnapshot(db);
}
