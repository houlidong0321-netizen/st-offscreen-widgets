#!/usr/bin/env node
/** 跑全部测试。用法：node tests/run-all.cjs */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.test.cjs')).sort();
let failed = 0;
let totalPass = 0, totalFail = 0;

console.log('='.repeat(52));
console.log('  Ego 小助手 · 测试');
console.log('='.repeat(52));

for (const f of files) {
    try {
        const out = execFileSync('node', [path.join(dir, f)], { encoding: 'utf8' });
        process.stdout.write(out);
        const m = /(\d+) 通过, (\d+) 失败/.exec(out);
        if (m) { totalPass += +m[1]; totalFail += +m[2]; }
        if (/[1-9]\d* 失败/.test(out)) failed++;
    } catch (e) {
        failed++;
        process.stdout.write(String(e.stdout || ''));
        console.error(`\n!! ${f} 执行出错:\n${String(e.stderr || e.message).split('\n').slice(0, 6).join('\n')}`);
    }
}

console.log('\n' + '='.repeat(52));
console.log(`总计: ${totalPass} 通过, ${totalFail} 失败（${files.length} 个测试文件）`);
console.log('='.repeat(52));
process.exit(failed ? 1 : 0);
