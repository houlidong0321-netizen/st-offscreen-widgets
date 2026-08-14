/** 设置：默认值、迁移、注入位置与深度 */
const { boot, tick, check, summary } = require('./harness.cjs');

(async () => {
    console.log('\n[02] 设置与注入');
    const app = boot({ expose: ['settings', 'chatData', 'loreEntries', 'updateInjections', 'buildLoreInjectionGroups'] });
    await tick();
    const T = app.T(); const s = T.settings();

    check('组件注入默认关', s.injectWidgets === false);
    check('表格注入默认开·深度3', s.offscreen.injectTables === true && s.offscreen.injectDepth === 3);
    check('总结注入默认开·深度999', s.summary.injectEnabled === true && s.summary.injectDepth === 999);
    check('剧情注入默认开·深度1', s.plot.injectEnabled === true && s.plot.injectDepth === 1);
    check('缓冲默认 0/2/0/0',
        s.floorBackoff === 0 && s.offscreen.floorBackoff === 2 && s.summary.floorBackoff === 0 && s.plot.floorBackoff === 0,
        `${s.floorBackoff}/${s.offscreen.floorBackoff}/${s.summary.floorBackoff}/${s.plot.floorBackoff}`);
    check('老聊天默认弹窗询问', s.offscreen.newChatBehavior === 'ask');
    check('默认非流式', s.api.stream === false);
    check('总结默认按楼层计数', s.summary.countMode === 'floor');

    // 注入统一走 IN_CHAT(1) + 深度
    T.loreEntries().push({ id: 'a', name: 'x', type: 'setting', content: 'AAA', enabled: true, depth: 5 });
    T.updateInjections();
    const k = Object.keys(app.rec.injected).find((x) => x.includes('lore'));
    check('注入位置为聊天中(1)且深度生效', app.rec.injected[k].p === 1 && app.rec.injected[k].d === 5,
        `${app.rec.injected[k].p}/${app.rec.injected[k].d}`);

    // 按深度分组合并
    T.loreEntries().push({ id: 'b', name: 'y', type: 'npc', content: 'BBB', enabled: true, depth: 5 });
    T.loreEntries().push({ id: 'c', name: 'z', type: 'npc', content: 'CCC', enabled: true, depth: 9 });
    const g = T.buildLoreInjectionGroups();
    check('相同深度合并为一组', g.length === 2, g.map((x) => '@' + x.depth).join(','));

    // 关键词触发
    const app2 = boot({
        expose: ['settings', 'loreEntries', 'buildLoreInjectionGroups'],
        chat: [{ name: 'C', mes: '两人走进医院大厅。', is_user: false }],
    });
    await tick();
    const T2 = app2.T();
    T2.loreEntries().push({ id: '1', name: '常驻', type: 'setting', content: 'ALWAYS', enabled: true, depth: 0 });
    T2.loreEntries().push({ id: '2', name: '命中', type: 'npc', content: 'HIT', keywords: '医院', enabled: true, depth: 0 });
    T2.loreEntries().push({ id: '3', name: '未命中', type: 'npc', content: 'MISS', keywords: '飞船', enabled: true, depth: 0 });
    T2.loreEntries().push({ id: '4', name: '停用', type: 'npc', content: 'OFF', enabled: false, depth: 0 });
    const txt = T2.buildLoreInjectionGroups().map((x) => x.text).join('');
    check('常驻条目注入', txt.includes('ALWAYS'));
    check('关键词命中注入', txt.includes('HIT'));
    check('关键词未命中不注入', !txt.includes('MISS'));
    check('停用条目不注入', !txt.includes('OFF'));

    // 迁移：旧版设置结构
    const old = { offscreen_widgets: { offscreen: { enabled: true, followWidgets: false }, autoTriggers: { offscreenByFloor: { enabled: true, interval: 8 } }, plot: { directions: [{ id: 'he', name: 'HE', enabled: true }] } } };
    const app3 = boot({ expose: ['settings'], extensionSettings: old });
    await tick();
    const s3 = app3.T().settings();
    check('迁移：旧楼层触发→自动/自选楼层', s3.offscreen.triggerMode === 'auto' && s3.offscreen.autoMode === 'floor' && s3.offscreen.floorInterval === 8);
    check('迁移：方向补上写作约束', !!s3.plot.directions.find((d) => d.id === 'he')?.prompt);
    check('迁移：保留用户已有选择', s3.plot.directions.find((d) => d.id === 'he')?.enabled === true);

    summary('[02] 设置与注入');
})();
