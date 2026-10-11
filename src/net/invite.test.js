import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInvite, formatInvite } from './invite.js';

test('bare code means "this server"', () => {
  assert.deepEqual(parseInvite(' g7zj6 '), { server: null, code: 'G7ZJ6' });
});

test('tunnel invites default to https', () => {
  assert.deepEqual(parseInvite('quiet-river-12.trycloudflare.com/G7ZJ6'), {
    server: 'https://quiet-river-12.trycloudflare.com',
    code: 'G7ZJ6',
  });
});

test('LAN invites default to http and keep the port', () => {
  assert.deepEqual(parseInvite('192.168.1.20:3001/G7ZJ6'), { server: 'http://192.168.1.20:3001', code: 'G7ZJ6' });
});

test('full URLs and ?room= work', () => {
  assert.deepEqual(parseInvite('https://example.com/?room=g7zj6'), { server: 'https://example.com', code: 'G7ZJ6' });
});

test('junk is rejected', () => {
  assert.equal(parseInvite('hello'), null);
  assert.equal(parseInvite('example.com/'), null);
  assert.equal(parseInvite('G7ZJ0'), null, '0 is not in the code alphabet');
});

test('format round-trips', () => {
  const inv = formatInvite('https://quiet-river-12.trycloudflare.com', 'G7ZJ6');
  assert.equal(inv, 'quiet-river-12.trycloudflare.com/G7ZJ6');
  assert.deepEqual(parseInvite(inv).code, 'G7ZJ6');
});
