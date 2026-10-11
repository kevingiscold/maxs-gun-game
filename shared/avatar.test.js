import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeAvatar, toggleAccessory, fitAccessories } from './avatar.js';

test('several accessories at once, one per slot', () => {
  assert.deepEqual(fitAccessories(['cap', 'cigar', 'shades']), ['cap', 'shades', 'cigar']);
  assert.deepEqual(fitAccessories(['eyepatch', 'glasses']), ['glasses'], 'both on the eyes: the later one wins');
  assert.deepEqual(toggleAccessory(['cap', 'glasses'], 'eyepatch'), ['cap', 'eyepatch']);
  assert.deepEqual(toggleAccessory(['cap', 'cigar'], 'cap'), ['cigar'], 'clicking again takes it off');
});

test('old saves with a single accessory still load; junk is dropped', () => {
  assert.deepEqual(sanitizeAvatar({ accessory: 'cigar' }).accessories, ['cigar']);
  assert.deepEqual(sanitizeAvatar({ accessory: 'fedora' }).accessories, []);
  assert.deepEqual(sanitizeAvatar({ accessories: ['cap', '<script>', 'cap'] }).accessories, ['cap']);
  assert.deepEqual(sanitizeAvatar({ accessories: 'cap' }).accessories, []);
});
