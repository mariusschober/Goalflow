import { describe, expect, it } from 'vitest';
import { mergeBackupCollection } from './storage';

describe('backup merge behavior', () => {
  it('merges typed entity arrays by id and keeps records absent from the backup', () => {
    expect(mergeBackupCollection(
      [{ id: 'one', title: 'Local' }, { id: 'two', title: 'Keep' }],
      [{ id: 'one', title: 'Backup' }, { id: 'three', title: 'Add' }]
    )).toEqual([
      { id: 'one', title: 'Backup' },
      { id: 'two', title: 'Keep' },
      { id: 'three', title: 'Add' }
    ]);
  });

  it('merges keyed settings and replaces unkeyed arrays', () => {
    expect(mergeBackupCollection({ enableAi: false, theme: 'dark' }, { enableAi: true }))
      .toEqual({ enableAi: true, theme: 'dark' });
    expect(mergeBackupCollection([1, 2], [3])).toEqual([3]);
  });
});
