/** 导火索排期：日期识别、写入待办表、已走事件不占月历 */
const { boot, tick, check, summary } = require('./harness.cjs');

const M = (extra = {}) => JSON.stringify({ events: [
    { id: '01', title: '催婚风暴', core: 'c', trigger: '长辈登门', triggerDate: '2026-08-15', triggerWindow: '晚上',
      branches: [{ key: 'A', condition: '承认', next: '02' }, { key: 'B', condition: '否认', next: '03' }] },
    { id: '02', title: '代价', core: 'c', trigger: '媒体拍到', triggerDate: '2026-08-18',
      branches: [{ key: 'A', condition: '硬刚', next: 'OPEN' }] },
    { id: '03', title: '冷战', core: 'c', trigger: '对方搬离', triggerDate: '2026-08-19',
      branches: [{ key: 'A', condition: '挽回', next: 'OPEN' }] },
    ...(extra.events || []),
] });

(async () => {
    console.log('\n[09] 导火索排期');
    const chat = [
        { name: 'C', mes: '[日期: 2026-08-13 | 时间: 20:00]\n正文内容', is_user: false },
    ];
    const app = boot({
        chat, modelReply: M(),
        expose: ['settings','chatData','generatePlot','detectStoryDate','syncTriggersToTimeline','scanPlotMarker','getPlotEvent'],
    });
    await tick();
    const T = app.T();

    check('识别当前故事日期', T.detectStoryDate() === '2026-08-13', T.detectStoryDate());

    await T.generatePlot();
    const evs = T.chatData().plot.events;
    check('解析 triggerDate', evs[0].triggerDate === '2026-08-15' && evs[0].triggerWindow === '晚上');
    check('提示词含当前日期', app.rec.lastUserPrompt.includes('2026-08-13'));
    check('提示词含排期规则', app.rec.lastSystemPrompt.includes('导火索排期') && app.rec.lastSystemPrompt.includes('1-7 天'));

    // 自动写进待办表
    const tl = () => T.chatData().offscreen.tables.timelineTable || [];
    check('导火索写进待办表', tl().length === 3, `${tl().length} 行`);
    check('待办含日期与时段', tl().some(r => r.time === '2026-08-15 晚上'));
    check('标记来源为 Plot', tl().every(r => /\[Plot_/.test(r.chapter)));
    check('按日期排序', tl()[0].time.startsWith('2026-08-15'));

    // 走过的事件不再占月历
    chat.push({ name: 'C', mes: 'x', is_user: false });
    T.scanPlotMarker('<!--EGO_PLOT:01:A-->', chat.length - 1);
    check('已经历事件移出月历', !tl().some(r => /Plot_01/.test(r.chapter)), `剩 ${tl().length} 行`);
    check('未发生事件仍保留', tl().some(r => /Plot_02/.test(r.chapter)));

    // 用户自己写的待办不能被冲掉
    T.chatData().offscreen.tables.timelineTable.push({ time: '2026-09-01', task: '我自己加的', chapter: '`[Chapter_9]`' });
    T.syncTriggersToTimeline();
    check('不覆盖用户自己的待办', tl().some(r => r.task === '我自己加的'));

    // 无日期时不硬排
    const app2 = boot({
        chat: [{ name: 'C', mes: '正文', is_user: false }],
        modelReply: JSON.stringify({ events: [{ id: '01', title: 'A', core: '', trigger: 't', triggerDate: '', branches: [{ key: 'A', condition: 'x', next: 'OPEN' }] }] }),
        expose: ['chatData','generatePlot'],
    });
    await tick();
    await app2.T().generatePlot();
    check('无日期不写进月历', (app2.T().chatData().offscreen.tables.timelineTable || []).length === 0);

    // 非法日期要被丢弃
    const app3 = boot({
        chat: [{ name: 'C', mes: '正文', is_user: false }],
        modelReply: JSON.stringify({ events: [{ id: '01', title: 'A', core: '', trigger: 't', triggerDate: '下周三', branches: [{ key: 'A', condition: 'x', next: 'OPEN' }] }] }),
        expose: ['chatData','generatePlot'],
    });
    await tick();
    await app3.T().generatePlot();
    check('非法日期被丢弃', app3.T().chatData().plot.events[0].triggerDate === '');

    summary('[09] 导火索排期');
})();
