/** 世界书筛选与反控制、API 地址归一化与错误提示、表格增量 */
const { boot, tick, check, summary } = require('./harness.cjs');

(async () => {
    console.log('\n[05] 世界书 / API / 表格');

    // ---- 世界书 ----
    const BOOK = { entries: {
        '0': { uid: 0, comment: '20岁线', content: 'AAA', disable: false },
        '1': { uid: 1, comment: '30岁线', content: 'BBB', disable: false },
        '2': { uid: 2, comment: '停用项', content: 'CCC', disable: true },
    } };
    const app = boot({
        activeBooks: ['书A'],
        context: { loadWorldInfo: async (n) => (n === '书A' ? BOOK : null) },
        expose: ['settings','chatData','gatherWorldInfo','fetchWorldInfoEntriesForManagement','applyReverseWorldInfo','saveWiStateToChat','isWorldInfoEntrySendEnabled'],
    });
    await tick();
    const T = app.T(); const s = T.settings();
    s.includeWorldInfo = true;

    let txt = await T.gatherWorldInfo();
    check('默认跟随酒馆启用状态', txt.includes('AAA') && txt.includes('BBB') && !txt.includes('CCC'));
    s.worldInfoOverrides['书A::1'] = false;
    txt = await T.gatherWorldInfo();
    check('取消勾选后不发送', txt.includes('AAA') && !txt.includes('BBB'));
    s.worldInfoOverrides['书A::2'] = true;
    txt = await T.gatherWorldInfo();
    check('可覆盖启用酒馆中停用的条目', txt.includes('CCC'));

    // 反控制
    const entries = await T.fetchWorldInfoEntriesForManagement();
    T.saveWiStateToChat(entries);
    const res = await T.applyReverseWorldInfo();
    check('写回酒馆世界书', BOOK.entries['1'].disable === true && BOOK.entries['0'].disable === false, `改动 ${res.changed} 条`);
    check('调用 saveWorldInfo', app.rec.savedWorldInfo?.n === '书A');
    check('状态一致时不重复写盘', (await T.applyReverseWorldInfo()).changed === 0);
    delete T.chatData().wiState['书A::0'];
    BOOK.entries['0'].disable = true;
    await T.applyReverseWorldInfo();
    check('不碰未设定过的条目', BOOK.entries['0'].disable === true);

    // ---- API ----
    let sent = null;
    const app2 = boot({
        url: 'https://tavern.local/',
        expose: ['settings','normalizeApiUrl','explainFetchError','callCustomApi','testApiPreset'],
        fetch: async (url, opt) => {
            sent = { url, body: JSON.parse(opt.body) };
            if (sent.body.stream) return { ok: true, status: 200, text: async () => 'data: {"choices":[{"delta":{"content":"流式"}}]}\ndata: [DONE]' };
            return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '非流式' } }] }), text: async () => '' };
        },
    });
    await tick();
    const T2 = app2.T(); const N = T2.normalizeApiUrl;
    check('URL 归一化：裸域名', N('https://x.com') === 'https://x.com/chat/completions');
    check('URL 归一化：带 /v1', N('https://x.com/v1') === 'https://x.com/v1/chat/completions');
    check('URL 归一化：已含完整路径', N('https://x.com/v1/chat/completions') === 'https://x.com/v1/chat/completions');
    check('URL 归一化：补协议', N('x.com/v1') === 'https://x.com/v1/chat/completions');
    check('错误提示：混合内容', T2.explainFetchError(new TypeError('Failed to fetch'), 'http://127.0.0.1:5000/v1/chat/completions').includes('混合内容'));
    check('错误提示：CORS 并建议回退', (() => { const e = T2.explainFetchError(new TypeError('Failed to fetch'), 'https://api.openai.com/v1/x'); return e.includes('CORS') && e.includes('跟随酒馆'); })());

    const preset = { id: 'p', name: 'P', url: 'https://api.x.com/v1', key: 'k', model: 'm' };
    check('非流式调用', (await T2.callCustomApi('s', 'u', preset)) === '非流式' && sent.body.stream === false);
    T2.settings().api.stream = true;
    check('流式解析 SSE', (await T2.callCustomApi('s', 'u', preset)) === '流式' && sent.body.stream === true);

    // ---- 表格 ----
    const app3 = boot({
        expose: ['settings','chatData','generateOffscreen','buildOffscreenSystemPrompt','getOffscreenTables'],
        modelReply: JSON.stringify({ scene_table: [{ tag: '`[Scene_1]`', name: '咖啡馆', location: '市中心', structure: '', usage: '' }] }),
    });
    await tick();
    const T3 = app3.T();
    check('内置六张表', T3.getOffscreenTables().length === 6);
    const cd = T3.chatData();
    cd.offscreen.tables = { itemAnchorTable: [{ tag: '`[Item_Anchor_1]`', name: '旧怀表', chapters: '', location: 'A的口袋', status: '留存' }] };
    await T3.generateOffscreen();
    check('已有表格随请求发送', app3.rec.lastUserPrompt.includes('旧怀表'));
    check('要求增量维护', app3.rec.lastUserPrompt.includes('增量维护') && app3.rec.lastUserPrompt.includes('禁止只输出新增部分'));
    check('模型漏返回的表保留旧数据', cd.offscreen.tables.itemAnchorTable.length === 1);
    const sys = T3.buildOffscreenSystemPrompt();
    check('系统提示词强调保留每一行', sys.includes('已有的每一行都必须原样保留在输出里'));

    summary('[05] 世界书 / API / 表格');
})();
