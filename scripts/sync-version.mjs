#!/usr/bin/env node
/**
 * 同步版本号：以 manifest.json 为准，写进 index.js 的 EXT_VERSION 与 README 顶部。
 * 用法：
 *   node scripts/sync-version.mjs           # 检查并同步
 *   node scripts/sync-version.mjs 3.2.0     # 顺便把版本号改成 3.2.0
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const mfPath = path.join(root, 'manifest.json');
const idxPath = path.join(root, 'index.js');

const mf = JSON.parse(fs.readFileSync(mfPath, 'utf8'));
const newVer = process.argv[2];

if (newVer) {
    if (!/^\d+\.\d+\.\d+$/.test(newVer)) {
        console.error(`版本号格式应为 x.y.z，收到：${newVer}`);
        process.exit(1);
    }
    mf.version = newVer;
    fs.writeFileSync(mfPath, JSON.stringify(mf, null, 4) + '\n', 'utf8');
    console.log(`manifest.json → ${newVer}`);
}

const ver = mf.version;
let idx = fs.readFileSync(idxPath, 'utf8');
const m = /const EXT_VERSION = '([^']*)'/.exec(idx);
if (!m) { console.error('index.js 里找不到 EXT_VERSION'); process.exit(1); }

if (m[1] === ver) {
    console.log(`index.js  已一致：${ver}`);
} else {
    idx = idx.replace(/const EXT_VERSION = '[^']*'/, `const EXT_VERSION = '${ver}'`);
    fs.writeFileSync(idxPath, idx, 'utf8');
    console.log(`index.js  ${m[1]} → ${ver}`);
}

const rdPath = path.join(root, 'README.md');
if (fs.existsSync(rdPath)) {
    const rd = fs.readFileSync(rdPath, 'utf8');
    const upd = rd.replace(/SillyTavern 扩展 · v[\d.]+/, `SillyTavern 扩展 · v${ver}`);
    if (upd !== rd) { fs.writeFileSync(rdPath, upd, 'utf8'); console.log(`README.md → ${ver}`); }
    else console.log(`README.md 已一致：${ver}`);
}
