import fs from 'node:fs';
import 'fake-indexeddb/auto';

class TestLocalStorage {
  values = new Map();
  get length() { return this.values.size; }
  key(index) { return Array.from(this.values.keys())[index] ?? null; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
  clear() { this.values.clear(); }
}
const localStorage = new TestLocalStorage();
globalThis.window = { localStorage, dispatchEvent: () => true };
globalThis.localStorage = localStorage;

import { storageService } from '../services/storage.ts';
import { encryptBackup } from '../services/backupCrypto.ts';

const ownerA = '11111111-1111-4111-8111-111111111111';
const ownerB = '22222222-2222-4222-8222-222222222222';

async function generate() {
  const task = {
    id: 'task-golden-1',
    title: 'Golden task preserved',
    notes: '',
    tags: [],
    schedulePrecision: 'day',
    scheduledFor: '2026-08-27',
    scheduledTime: null,
    plannedOrder: 0,
    isFrog: false,
    beforeFrog: false,
    frogFailures: 0,
    source: 'manual',
    goalId: null,
    parentTaskId: null,
    habitId: null,
    createdAt: 1,
    updatedAt: 1,
    completedAt: null,
    deletedAt: null,
    extraJson: '{}'
  };
  await storageService.set('tasks', ownerA, [task], 'local');
  await storageService.flushPendingLocalChanges(ownerA);
  const backup = await storageService.exportBackup(ownerA);
  console.log('backup collections', Object.keys(backup.collections));
  console.log('checksum', backup.checksum);
  console.log('owner', backup.ownerKey);
  console.log(JSON.stringify(backup.collections).slice(0,800));
  const encrypted = await encryptBackup(backup, 'correct horse battery staple 123');
  console.log('encrypted ok');
  fs.mkdirSync('tests/fixtures', { recursive: true });
  fs.writeFileSync('tests/fixtures/golden-backup-ownerA.json', JSON.stringify(backup, null, 2));
  fs.writeFileSync('tests/fixtures/golden-backup-encrypted-ownerA.json', JSON.stringify(encrypted, null, 2));
  await storageService.set('tasks', ownerB, [{ ...task, id: 'task-wrong-owner', title: 'Wrong owner task' }], 'local');
  await storageService.flushPendingLocalChanges(ownerB);
  const backupB = await storageService.exportBackup(ownerB);
  fs.writeFileSync('tests/fixtures/golden-backup-ownerB.json', JSON.stringify(backupB, null, 2));
  console.log('generated fixtures');
  const withOutbox = JSON.parse(JSON.stringify(backup));
  withOutbox.collections['sync_outbox'] = [{ mutationId: 'mutation-pending-1', entityType: 'tasks', entityId: 'task-golden-1', payload: { id: 'task-golden-1' } }];
  withOutbox.collections['sync_conflicts'] = [{ id: 'conflict-1', entityType: 'tasks', entityId: 'task-golden-1', localPayload: '{}', serverPayload: '{}' }];
  fs.writeFileSync('tests/fixtures/golden-backup-with-outbox.json', JSON.stringify(withOutbox, null, 2));
  console.log('with outbox done');
}
generate().catch(e=>{console.error(e); process.exit(1)});
