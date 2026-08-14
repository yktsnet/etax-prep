import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GitHubStore } from '../core/store-github.mjs';

const store = () => new GitHubStore({ token: 't', repo: 'o/r' });

function stubFetch(handler) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  return () => { globalThis.fetch = original; };
}

const notFound = () => new Response('Not Found', { status: 404 });
const ok = (body) => new Response(JSON.stringify(body), {
  status: 200, headers: { 'content-type': 'application/json' },
});

test('取得の404は「まだ無い」として扱う', async () => {
  const restore = stubFetch(async () => notFound());
  try {
    assert.deepEqual(await store().listEntries(), []);
    assert.equal(await store().readReceipt('x/y.png'), null);
  } finally { restore(); }
});

test('書き込みの404は握り潰さず例外にする', async () => {
  const restore = stubFetch(async (_url, init) => (init?.method === 'PUT' ? notFound() : ok([])));
  try {
    await assert.rejects(
      () => store().addEntry({ id: 'a', date: '2026-08-10', kind: 'expense', account: 'zappi', amount: 200 }),
      /GitHub 404/,
    );
  } finally { restore(); }
});

test('証憑の保存も書き込み失敗を例外にする', async () => {
  const restore = stubFetch(async (_url, init) => (init?.method === 'PUT' ? notFound() : ok([])));
  try {
    await assert.rejects(() => store().saveReceipt('a', 'r.png', new Uint8Array([1])), /GitHub 404/);
  } finally { restore(); }
});

test('設定の保存も書き込み失敗を例外にする', async () => {
  const restore = stubFetch(async (_url, init) => (init?.method === 'PUT' ? notFound() : ok(null)));
  try {
    await assert.rejects(() => store().saveSettings({ salary: [] }), /GitHub 404/);
  } finally { restore(); }
});

test('1MB を超える証憑は raw で取り直して中身を返す', async () => {
  const body = new Uint8Array([7, 8, 9]);
  const restore = stubFetch(async (_url, init) => (
    init?.headers?.accept === 'application/vnd.github.raw'
      ? new Response(body, { status: 200 })
      : ok({ sha: 's', content: '', encoding: 'none' })
  ));
  try {
    assert.deepEqual(await store().readReceipt('a/big.webp'), body);
  } finally { restore(); }
});

test('トークンとリポジトリが無ければ生成時に落とす', () => {
  assert.throws(() => new GitHubStore({ repo: 'o/r' }), /GITHUB_TOKEN/);
  assert.throws(() => new GitHubStore({ token: 't' }), /GITHUB_REPO/);
});
