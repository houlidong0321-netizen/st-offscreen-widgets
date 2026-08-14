/** 剧情推演：矩阵生成、进度、标记扫描、备份恢复、提示词约束 */
const { boot, tick, check, summary, readSource } = require('./harness.cjs');

const MATRIX = JSON.stringify({ events: [
    { id: '01', title: 'E1', core: 'c', trigger: 't', branches: [{ key: 'A', condition: '结果一', next: '02' }, { key: 'B', condition: '结果二', next: 'OPEN' }] },
    { id: '02', title: 'E2', core: 'c', trigger: 't', branches: [{ key: 'A', condition: '结果三', next: 'OPEN' }] },
] });

(async () => {
    console.log('\n[03] 剧情推演');
    const chat = []; for (let i = 0; i < 5; i++) chat.push({ name: 'C', mes: 'm' + i, is_user: false });
    const app = boot({
        chat, modelReply: MATRIX,
        expose: ['settings', 'chatData', 'generatePlot', 'scanPlotMarker', 'restorePlotHistory', 'validateAndRepairPlot', 'getPlotEvent'],
    });
    await tick();
    const T = app.T(); const pl = () => T.chatData().plot;

    await T.generatePlot();
    check('矩阵生成', pl().events.length === 2);
    check('起始为第一个事件', pl().currentId === '01');
    check('记录起始楼层', pl().startMsgId === 5, String(pl().startMsgId));

    // 推进
    chat.push({ name: 'C', mes: 'x', is_user: false });
    T.scanPlotMarker('<!--EGO_PLOT:01:A-->', 5);
    check('标记推进到下一事件', pl().currentId === '02');
    check('未走分支被置灰', JSON.stringify(pl().deadBranches['01']) === '["B"]');
    check('记录已走路径', pl().path.length === 1);

    // 重新生成要清零进度
    const oldId = pl().matrixId;
    await T.generatePlot();
    check('新矩阵清零进度', pl().currentId === '01' && pl().path.length === 0 && Object.keys(pl().deadBranches).length === 0);
    check('新矩阵换 ID', pl().matrixId !== oldId);

    // 旧楼层的残留标记不该被采信
    const before = JSON.stringify(pl().path);
    const r = T.scanPlotMarker('<!--EGO_PLOT:01:A-->', 2);
    check('忽略矩阵生成前的标记', r === false && JSON.stringify(pl().path) === before);

    // 备份与恢复
    check('已备份上一版', pl().history.length >= 1);
    const cur = pl().matrixId;
    T.restorePlotHistory();
    check('恢复上一版', pl().matrixId === oldId);
    T.restorePlotHistory();
    check('可来回切换', pl().matrixId === cur);

    // 校验：悬空指向与死循环
    const dangling = [
        { id: '01', title: 'A', core: '', trigger: '', branches: [{ key: 'A', condition: 'x', next: '99' }] },
        { id: '02', title: 'B', core: '', trigger: '', branches: [{ key: 'A', condition: 'x', next: 'OPEN' }] }];
    const iss = T.validateAndRepairPlot(dangling);
    check('检出悬空分支', iss.dangling.length === 1);
    check('悬空自动改为 OPEN', dangling[0].branches[0].next === 'OPEN');

    const loop = [
        { id: '01', title: 'A', core: '', trigger: '', branches: [{ key: 'A', condition: 'x', next: '02' }] },
        { id: '02', title: 'B', core: '', trigger: '', branches: [{ key: 'A', condition: 'x', next: '01' }] }];
    check('检出死循环', T.validateAndRepairPlot(loop).deadloop.length === 2);

    // 提示词约束
    const P = app.rec.lastSystemPrompt;
    check('提示词：分支是结局走向', P.includes('是**这个事件的结局走向**'));
    check('提示词：分支不限两条且穷尽', P.includes('分支数量不限于 2 条') && P.includes('穷尽覆盖'));
    check('提示词：禁止写描述词', P.includes('禁止写穿着、表情、语气、情绪形容'));
    check('提示词：只在结果落定时触发', P.includes('分支只在最终结果确定的那一轮才算触发'));
    check('提示词：禁止悬空指向', P.includes('禁止悬空指向'));

    summary('[03] 剧情推演');
})();
