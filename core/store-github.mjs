const API = 'https://api.github.com';

const b64encode = (bytes) => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};
const b64decodeBytes = (b64) => {
  const bin = atob(b64.replace(/\n/g, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
const b64decodeText = (b64) => new TextDecoder().decode(b64decodeBytes(b64));
const b64encodeText = (text) => b64encode(new TextEncoder().encode(text));

// GitHub リポジトリを正本とする保存先。追記も更新も Contents API の
// read-modify-write（取得した sha を添えて PUT）で行う。単独利用のため競合は起きにくいが、
// sha 不一致で 409 が返った場合は呼び出し側でやり直す。
export class GitHubStore {
  constructor({ token, repo, branch = 'main', root = 'ledger' }) {
    if (!token || !repo) throw new Error('GITHUB_TOKEN と GITHUB_REPO が要ります');
    this.token = token;
    this.repo = repo;
    this.branch = branch;
    this.root = root.replace(/\/$/, '');
  }

  async #req(path, init = {}) {
    const res = await fetch(`${API}/repos/${this.repo}/${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${this.token}`,
        accept: 'application/vnd.github+json',
        'user-agent': 'etax-prep',
        'x-github-api-version': '2022-11-28',
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...init.headers,
      },
    });
    // 404 が「まだ無い」を意味するのは取得のときだけ。GitHub は権限不足のトークンにも
    // 404 を返すため、書き込みで握り潰すと保存に失敗しても成功として返ってしまう。
    if (res.status === 404 && (init.method ?? 'GET') === 'GET') return null;
    if (!res.ok) throw new Error(`GitHub ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.json();
  }

  #path(...parts) { return [this.root, ...parts].join('/'); }

  async #get(path) {
    const r = await this.#req(`contents/${encodeURI(path)}?ref=${this.branch}`);
    return r && !Array.isArray(r) ? { sha: r.sha, content: r.content, encoding: r.encoding } : null;
  }

  async #getRaw(path) {
    const res = await fetch(`${API}/repos/${this.repo}/contents/${encodeURI(path)}?ref=${this.branch}`, {
      headers: {
        authorization: `Bearer ${this.token}`,
        accept: 'application/vnd.github.raw',
        'user-agent': 'etax-prep',
        'x-github-api-version': '2022-11-28',
      },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GitHub ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return new Uint8Array(await res.arrayBuffer());
  }

  async #list(path) {
    const r = await this.#req(`contents/${encodeURI(path)}?ref=${this.branch}`);
    return Array.isArray(r) ? r : [];
  }

  async #put(path, contentB64, message, sha) {
    return this.#req(`contents/${encodeURI(path)}`, {
      method: 'PUT',
      body: JSON.stringify({ message, content: contentB64, branch: this.branch, ...(sha ? { sha } : {}) }),
    });
  }

  async init() { /* GitHub 側は事前作成が不要 */ }

  async #readJsonl(path) {
    const f = await this.#get(path);
    if (!f) return { entries: [], sha: null };
    return {
      entries: b64decodeText(f.content).split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l)),
      sha: f.sha,
    };
  }

  async listEntries() {
    const files = (await this.#list(this.#path('entries')))
      .filter((f) => f.name.endsWith('.jsonl'))
      .sort((a, b) => a.name.localeCompare(b.name));

    const all = await Promise.all(files.map((f) => this.#readJsonl(f.path).then((r) => r.entries)));
    return all.flat().sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id));
  }

  async listYears() {
    const files = await this.#list(this.#path('entries'));
    return [...new Set(files.map((f) => f.name.slice(0, 4)).filter((y) => /^\d{4}$/.test(y)))]
      .map(Number).sort((a, b) => b - a);
  }

  async addEntry(entry) {
    const path = this.#path('entries', `${entry.date.slice(0, 7)}.jsonl`);
    const { entries, sha } = await this.#readJsonl(path);
    const next = [...entries, entry].sort((a, b) => (a.date + a.id).localeCompare(b.date + b.id));
    await this.#put(path, b64encodeText(next.map((e) => JSON.stringify(e)).join('\n') + '\n'),
      `feat(entry): ${entry.kind} ${entry.account} ${entry.amount}`, sha);
    return entry;
  }

  // 日付の変更で所属月が変わりうるため、旧月から取り除いて新月へ入れ直す。
  async updateEntry(id, patch) {
    const files = (await this.#list(this.#path('entries'))).filter((f) => f.name.endsWith('.jsonl'));

    for (const f of files) {
      const { entries, sha } = await this.#readJsonl(f.path);
      const target = entries.find((e) => e.id === id);
      if (!target) continue;

      const updated = { ...target, ...patch, id, updatedAt: new Date().toISOString() };
      const stayed = updated.date.slice(0, 7) === target.date.slice(0, 7);
      const rest = entries.filter((e) => e.id !== id);
      const keep = stayed ? [...rest, updated] : rest;

      await this.#put(f.path,
        b64encodeText(keep.sort((a, b) => (a.date + a.id).localeCompare(b.date + b.id))
          .map((e) => JSON.stringify(e)).join('\n') + (keep.length ? '\n' : '')),
        `fix(entry): update ${id}`, sha);

      if (!stayed) {
        const to = this.#path('entries', `${updated.date.slice(0, 7)}.jsonl`);
        const dst = await this.#readJsonl(to);
        const next = [...dst.entries, updated].sort((a, b) => (a.date + a.id).localeCompare(b.date + b.id));
        await this.#put(to, b64encodeText(next.map((e) => JSON.stringify(e)).join('\n') + '\n'),
          `fix(entry): move ${id}`, dst.sha);
      }
      return updated;
    }
    return null;
  }

  async saveReceipt(id, name, bytes) {
    const rel = `${id}/${name}`;
    await this.#put(this.#path('receipts', rel), b64encode(bytes), `feat(receipt): ${rel}`);
    return rel;
  }

  // Contents API は 1MB を超えるファイルの content を空で返す。そのまま復号すると
  // 0 バイトの証憑が例外も出さずに通ってしまうため、raw で取り直す
  async readReceipt(rel) {
    const path = this.#path('receipts', rel);
    const f = await this.#get(path);
    if (!f) return null;
    if (f.encoding !== 'base64') return this.#getRaw(path);
    return b64decodeBytes(f.content);
  }

  async getSettings() {
    const f = await this.#get(this.#path('settings.json'));
    return f ? JSON.parse(b64decodeText(f.content)) : { salary: [], deductions: 0, withheld: 0 };
  }

  async saveSettings(s) {
    const path = this.#path('settings.json');
    const cur = await this.#get(path);
    await this.#put(path, b64encodeText(JSON.stringify(s, null, 2)), 'chore(settings): update', cur?.sha);
    return s;
  }
}
