/** 设置：默认值、迁移、注入位置与深度 */
const { boot, tick, check, summary } = require('./harness.cjs');

(async () => {
    console.log('\n[02] 设置与注入');
    const app = boot({ expose: ['settings', 'chatData', 'updateInjections'] });
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
    const cd = T.chatData();
    cd.summary.bigSummaries.push({ id: 'x', fromCh: 0, toCh: 1, imported: true, rawText: '档案', sections: [], level: 1 });
    T.updateInjections();
    const k = Object.keys(app.rec.injected).find((x) => x.includes('summary'));
    check('注入位置为聊天中(1)且深度生效', app.rec.injected[k].p === 1 && app.rec.injected[k].d === 999,
        `${app.rec.injected[k].p}/${app.rec.injected[k].d}`);

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
