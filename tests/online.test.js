import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultLobby, lobbyBase, PUBLIC_LOBBY_URL } from '../src/online.js';

test('Pages uses the deployed lobby and replaces the stale Pages address', () => {
  const pages = 'https://triley98.github.io';
  assert.equal(defaultLobby(pages), PUBLIC_LOBBY_URL);
  assert.equal(defaultLobby(pages, '', pages), PUBLIC_LOBBY_URL);
  assert.equal(defaultLobby(pages, '', 'broken'), PUBLIC_LOBBY_URL);
  assert.throws(() => lobbyBase(pages), /GitHub Pages cannot run/);
});

test('local and Worker hosting retain same-origin connections and overrides', () => {
  for (const origin of ['http://127.0.0.1:5173', PUBLIC_LOBBY_URL])
    assert.equal(defaultLobby(origin), origin);
  assert.equal(defaultLobby('https://triley98.github.io', 'https://custom.workers.dev', PUBLIC_LOBBY_URL), 'https://custom.workers.dev');
});
