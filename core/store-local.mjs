import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

export class LocalStore {
  constructor(root) {
    this.root = root;
    this.entriesDir = path.join(root, 'entries');
    this.receiptsDir = path.join(root, 'receipts');
    this.settingsPath = path.join(root, 'settings.json');
  }

  async init() {
    await mkdir(this.entriesDir, { recursive: true });
    await mkdir(this.receiptsDir, { recursive: true });
    if (!existsSync(this.settingsPath)) {
      await writeFile(this.settingsPath, JSON.stringify({ salary: [], deductions: 0, withheld: 0 }, null, 2));
    }
  }

  #monthFile(date) {
    return path.join(this.entriesDir, `${date.slice(0, 7)}.jsonl`);
  }

  async listEntries() {
    const files = existsSync(this.entriesDir) ? await readdir(this.entriesDir) : [];
    const out = [];
    for (const f of files.filter((f) => f.endsWith('.jsonl')).sort()) {
      const text = await readFile(path.join(this.entriesDir, f), 'utf8');
      for (const line of text.split('\n')) {
        if (line.trim()) out.push(JSON.parse(line));
      }
    }
    return out.sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id));
  }

  async addEntry(entry) {
    const file = this.#monthFile(entry.date);
    const prev = existsSync(file) ? await readFile(file, 'utf8') : '';
    await writeFile(file, prev + JSON.stringify(entry) + '\n');
    return entry;
  }

  // 日付の変更で所属月が変わりうるため、全月から除いてから入れ直す。
  async updateEntry(id, patch) {
    const all = await this.listEntries();
    const target = all.find((e) => e.id === id);
    if (!target) return null;
    const updated = { ...target, ...patch, id, updatedAt: new Date().toISOString() };

    const byMonth = new Map();
    for (const e of all) {
      if (e.id === id) continue;
      const k = e.date.slice(0, 7);
      if (!byMonth.has(k)) byMonth.set(k, []);
      byMonth.get(k).push(e);
    }
    const k = updated.date.slice(0, 7);
    if (!byMonth.has(k)) byMonth.set(k, []);
    byMonth.get(k).push(updated);

    for (const [month, list] of byMonth) {
      list.sort((a, b) => (a.date + a.id).localeCompare(b.date + b.id));
      await writeFile(
        path.join(this.entriesDir, `${month}.jsonl`),
        list.map((e) => JSON.stringify(e)).join('\n') + '\n',
      );
    }
    return updated;
  }

  async listYears() {
    const files = existsSync(this.entriesDir) ? await readdir(this.entriesDir) : [];
    return [...new Set(files.filter((f) => f.endsWith('.jsonl')).map((f) => f.slice(0, 4)))]
      .map(Number).sort((a, b) => b - a);
  }

  async saveReceipt(id, name, bytes) {
    const dir = path.join(this.receiptsDir, id);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, name), bytes);
    return `${id}/${name}`;
  }

  async readReceipt(rel) {
    const full = path.join(this.receiptsDir, rel);
    if (!full.startsWith(this.receiptsDir) || !existsSync(full)) return null;
    return readFile(full);
  }

  async getSettings() {
    return JSON.parse(await readFile(this.settingsPath, 'utf8'));
  }

  async saveSettings(s) {
    await writeFile(this.settingsPath, JSON.stringify(s, null, 2));
    return s;
  }
}
