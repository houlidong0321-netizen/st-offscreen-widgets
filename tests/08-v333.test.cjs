/** 本轮四项改动：预设模式、日志下载、蝴蝶效应校验、首次弹窗阈值 */
const { boot, tick, check, summary } = require('./harness.cjs');

(async () => {
    console.log('\n[08] 预设模式 / 日志 / 蝴蝶效应 / 首次弹窗');

    // ---- 1) 结合预设：应走 generateQuietPrompt ----
    let quietCalled = null, rawCalled = null;
    const app = boot({
        expose: ['settings', 'callModel'],
        context: {
            generateQuietPrompt: async (o) => { quietCalled = o; return 'from-preset'; },
            generateRaw: async (o) => { rawCalled = o; return 'from-raw'; },
        },
    });
    await tick();
    const T = app.T(); const s = T.settings();

    check('默认为仅发提示词', s.requestMode === 'raw');
    await T.callModel('SYS', 'USER', 'x', 'widgets');
    check('raw 模式走 generateRaw', rawCalled && !quietCalled);

    quietCalled = rawCalled = null;
    s.requestMode = 'preset';
    const out = await T.callModel('SYS', 'USER', 'x', 'widgets');
    check('preset 模式走 generateQuietPrompt', !!quietCalled && !rawCalled);
    check('提示词被合并为最后指令', quietCalled.quietPrompt.includes('SYS') && quietCalled.quietPrompt.includes('USER'));
    check('不写进聊天记录', quietCalled.quietToLoud === false);
    check('世界书照常参与', quietCalled.skipWIAN === false);
    check('返回值正确', out === 'from-preset');

    // 旧版酒馆没有该方法时要回退
    const app2 = boot({ expose: ['settings', 'callModel'], context: { generateQuietPrompt: undefined } });
    await tick();
    app2.T().settings().requestMode = 'preset';
    const out2 = await app2.T().callModel('S', 'U', 'x', 'widgets');
    check('无 generateQuietPrompt 时回退', typeof out2 === 'string');

    // preset 模式要抓取酒馆最终提示词
    const listeners = {};
    let emitted = null;
    const appCap = boot({
        expose: ['settings', 'callModel'],
        context: {
            eventTypes: { CHARACTER_MESSAGE_RENDERED: 'a', CHAT_CHANGED: 'b',
                GENERATE_AFTER_COMBINE_PROMPTS: 'gacp', CHAT_COMPLETION_PROMPT_READY: 'ccpr' },
            eventSource: {
                on(k, f) { (listeners[k] = listeners[k] || []).push(f); },
                removeListener(k, f) { listeners[k] = (listeners[k] || []).filter(x => x !== f); },
            },
            generateQuietPrompt: async () => {
                // 模拟酒馆在生成过程中派发最终提示词
                for (const f of (listeners['ccpr'] || [])) f({ chat: [
                    { role: 'system', content: '预设里的越狱条目' },
                    { role: 'system', content: '角色卡描述' },
                    { role: 'user', content: '我们的指令' }] });
                emitted = true;
                return 'ok';
            },
        },
    });
    await tick();
    appCap.T().settings().requestMode = 'preset';
    await appCap.T().callModel('SYS', 'USER', '组件', 'widgets');
    const capLog = appCap.rec.logs.join('\n');
    check('记录了酒馆最终提示词', capLog.includes('酒馆最终发出的消息数组'), '');
    check('最终提示词含预设内容', capLog.includes('预设里的越狱条目'));
    check('用完解绑监听', (listeners['ccpr'] || []).length === 0, String((listeners['ccpr'] || []).length));

    // ---- 3) 蝴蝶效应校验 ----
    const app3 = boot({ expose: ['validateAndRepairPlot'] });
    await tick();
    const V = app3.T().validateAndRepairPlot;
    const same = [
        { id: '01', title: 'A', core: '', trigger: '', branches: [{ key: 'A', condition: 'x', next: '02' }, { key: 'B', condition: 'y', next: '02' }] },
        { id: '02', title: 'B', core: '', trigger: '', branches: [{ key: 'A', condition: 'z', next: 'OPEN' }] }];
    const iss = V(same);
    check('检出分支殊途同归', iss.sameTarget.length === 1, iss.sameTarget.join(''));

    const ok = [
        { id: '01', title: 'A', core: '', trigger: '', branches: [{ key: 'A', condition: 'x', next: '02' }, { key: 'B', condition: 'y', next: '03' }] },
        { id: '02', title: 'B', core: '', trigger: '', branches: [{ key: 'A', condition: 'z', next: 'OPEN' }] },
        { id: '03', title: 'C', core: '', trigger: '', branches: [{ key: 'A', condition: 'w', next: 'OPEN' }] }];
    check('正常分岔不误报', V(ok).sameTarget.length === 0);

    const bothOpen = [{ id: '01', title: 'A', core: '', trigger: '', branches: [{ key: 'A', condition: 'x', next: 'OPEN' }, { key: 'B', condition: 'y', next: 'OPEN' }] }];
    check('都指向 OPEN 不算违规', V(bothOpen).sameTarget.length === 0);

    // 提示词里要有这条规则
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'index.js'), 'utf8');
    check('提示词写明禁止殊途同归', src.includes('禁止指向同一个后续事件') && src.includes('平行时空'));

    // ---- 2) 日志面板：只留下载/复制/清空 ----
    check('日志不再逐条渲染', !src.includes('ow-log-entry'));
    check('提供下载按钮', src.includes('ow_log_download') && src.includes('ego-log-'));
    check('写日志时不重绘面板', src.includes('日志写得很频繁'));

    // ---- 4) 首次弹窗阈值 ----
    const short = [];
    for (let i = 0; i < 8; i++) short.push({ name: 'C', mes: 'm', is_user: false });
    const app4 = boot({
        chat: short,
        expose: ['settings', 'chatData', 'onCharacterMessageRendered'],
        confirm: () => { throw new Error('不该弹窗'); },
    });
    await tick();
    const T4 = app4.T(); const s4 = T4.settings();
    s4.offscreen.enabled = true; s4.offscreen.triggerMode = 'auto';
    s4.offscreen.autoMode = 'floor'; s4.offscreen.floorInterval = 10;
    let threw = false;
    try { await T4.onCharacterMessageRendered(7); } catch (e) { threw = true; }
    check('8 楼新聊天不弹窗（间隔10）', threw === false);
    check('已标记 firstSeen', T4.chatData().autoTriggerState.firstSeen === true);

    summary('[08] 预设模式 / 日志 / 蝴蝶效应 / 首次弹窗');
})();
