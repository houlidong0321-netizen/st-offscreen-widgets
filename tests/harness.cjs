/**
 * 测试脚手架：用 jsdom + 真 jQuery 把扩展整个加载起来，
 * 并 mock 掉 SillyTavern 的 getContext()，这样可以在无浏览器环境里
 * 真实地调用扩展内部函数、检查 DOM 渲染结果。
 *
 * 用法见同目录下任一 *.test.cjs。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const INDEX = path.join(ROOT, 'index.js');

function findModule(name) {
    // 依次尝试几个可能的位置，方便在不同机器上跑
    const candidates = [
        path.join(ROOT, 'node_modules', name),
        path.join(ROOT, '..', 'testenv', 'node_modules', name),
        path.join(process.env.HOME || '/root', 'testenv', 'node_modules', name),
    ];
    for (const p of candidates) if (fs.existsSync(p)) return p;
    throw new Error(
        `找不到依赖 ${name}。请先在扩展根目录执行：\n` +
        `  npm install --no-save jsdom jquery\n` +
        `（这两个只用于跑测试，扩展本身不需要任何依赖）`
    );
}

/**
 * 启动一个扩展实例。
 * @param {object} opts
 * @param {string[]} opts.expose      要暴露给测试的内部函数名
 * @param {object}   opts.context     覆盖默认的 getContext() 返回值
 * @param {array}    opts.chat        初始聊天记录
 * @param {string}   opts.html        额外的初始 DOM
 * @param {string[]} opts.activeBooks  酒馆里"已激活"的世界书名（填进 #world_info）
 * @param {function} opts.fetch       自定义 fetch
 * @param {string}   opts.url         页面地址（测 https/CORS 判断时有用）
 * @param {string}   opts.folder      模拟的扩展安装目录名
 * @param {string}   opts.scriptUrl   直接指定 import.meta.url（优先于 folder）
 */
function boot(opts = {}) {
    const { JSDOM } = require(findModule('jsdom'));
    const dom = new JSDOM(
        `<!DOCTYPE html><html><body>
           <div id="extensionsMenu"></div>
           <select id="world_info" multiple>${(opts.activeBooks || []).map((b) => `<option value="${b}" selected>${b}</option>`).join('')}</select>
           ${opts.html || ''}
         </body></html>`,
        { url: opts.url || 'http://localhost/', pretendToBeVisual: true }
    );
    const w = dom.window;

    const jqSrc = fs.readFileSync(path.join(findModule('jquery'), 'dist/jquery.js'), 'utf8');
    const $ = new Function('module', 'exports', 'window',
        jqSrc + '\nreturn (typeof jQuery!=="undefined")?jQuery:module.exports;'
    )({ exports: {} }, {}, w);
    w.$ = $; w.jQuery = $;

    // 记录扩展往外发的东西，方便断言
    const rec = {
        injected: {},      // setExtensionPrompt 的结果
        slashCommands: [], // 执行过的斜杠命令
        lastSystemPrompt: '',
        lastUserPrompt: '',
        savedWorldInfo: null,
        metaFlushed: 0,
        logs: [],
    };

    const chat = opts.chat || [];
    const chatMetadata = opts.chatMetadata || {};
    const extensionSettings = opts.extensionSettings || {};

    const baseContext = {
        extensionSettings, chatMetadata, chat,
        characters: [{ name: 'C', data: {} }], characterId: 0,
        name1: 'U', name2: 'C',
        eventSource: { on() {} },
        eventTypes: { CHARACTER_MESSAGE_RENDERED: 'a', CHAT_CHANGED: 'b' },
        saveSettingsDebounced() {},
        saveMetadataDebounced() {},
        saveMetadata: async () => { rec.metaFlushed++; },
        saveChat: async () => {},
        setExtensionPrompt(k, v, p, d) {
            if (v) rec.injected[k] = { v, p, d }; else delete rec.injected[k];
        },
        generateRaw: async (o) => {
            rec.lastSystemPrompt = o.systemPrompt || '';
            rec.lastUserPrompt = o.prompt || '';
            return typeof opts.modelReply === 'function' ? opts.modelReply(o) : (opts.modelReply ?? '{}');
        },
        executeSlashCommandsWithOptions: async (cmd) => { rec.slashCommands.push(cmd); },
        getRequestHeaders: () => ({}),
        loadWorldInfo: async () => ({ entries: {} }),
        saveWorldInfo: async (n, d) => { rec.savedWorldInfo = { n, d }; },
        reloadWorldInfoEditor() {},
        getPresetManager: () => null,
    };
    const context = Object.assign(baseContext, opts.context || {});
    const ST = { getContext: () => context };

    const expose = opts.expose || [];
    const src = fs.readFileSync(INDEX, 'utf8')
        .replace(/import\.meta\.url/g,
            JSON.stringify(opts.scriptUrl
                || (opts.url || 'http://localhost/') + `scripts/extensions/third-party/${opts.folder || 'ego-assistant'}/index.js`))
        .replace(/\}\)\(\);\s*$/,
            `  window.__T={${expose.join(',')}};\n})();`);

    const quietConsole = {
        log: (...a) => rec.logs.push(a.join(' ')),
        warn: (...a) => rec.logs.push(a.join(' ')),
        error: (...a) => rec.logs.push(a.join(' ')),
        debug: () => {},
    };

    new Function('$', 'jQuery', 'window', 'document', 'SillyTavern', 'location',
        'confirm', 'prompt', 'fetch', 'navigator', 'console', src)
        ($, $, w, w.document, ST, w.location,
            opts.confirm || (() => true),
            opts.prompt || (() => null),
            opts.fetch || (async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '' })),
            w.navigator, quietConsole);

    return { window: w, $, T: () => w.__T, rec, context, chat, dom };
}

/** 等一会儿，让 jQuery(ready) 和 setTimeout 里的初始化跑完 */
const tick = (ms = 250) => new Promise((r) => setTimeout(r, ms));

// ---- 极简断言 ----
let pass = 0, fail = 0;
const failures = [];

function check(name, cond, extra = '') {
    if (cond) { pass++; console.log(`  PASS  ${name}${extra ? '  ' + extra : ''}`); }
    else { fail++; failures.push(name); console.log(`  FAIL  ${name}${extra ? '  ' + extra : ''}`); }
}
const eq = (name, actual, expected) =>
    check(name, JSON.stringify(actual) === JSON.stringify(expected),
        JSON.stringify(actual) === JSON.stringify(expected) ? '' : `期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);

function summary(title) {
    console.log(`\n${title}: ${pass} 通过, ${fail} 失败`);
    if (fail) { console.log('失败项: ' + failures.join(', ')); process.exitCode = 1; }
}

/** 语法检查（要先把 import.meta 换掉，否则 node --check 会静默跳过） */
function syntaxCheckSource() {
    const src = fs.readFileSync(INDEX, 'utf8').replace(/import\.meta\.url/g, '"x"');
    const tmp = path.join(require('os').tmpdir(), `ego-check-${Date.now()}.js`);
    fs.writeFileSync(tmp, src);
    try {
        require('child_process').execSync(`node --check ${tmp}`, { stdio: 'pipe' });
        return { ok: true };
    } catch (e) {
        return { ok: false, message: String(e.stderr || e.message) };
    } finally {
        try { fs.unlinkSync(tmp); } catch (e) { /* ignore */ }
    }
}

module.exports = { boot, tick, check, eq, summary, syntaxCheckSource, ROOT, INDEX, readSource: () => fs.readFileSync(INDEX, 'utf8') };
