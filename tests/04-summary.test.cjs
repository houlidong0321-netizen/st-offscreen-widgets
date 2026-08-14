/** 总结：两种生成方式、计数模式、压缩还原、隐藏楼层不丢数据 */
const { boot, tick, check, summary } = require('./harness.cjs');

const DOC = '<大总结(第0-3楼)>\n- 【转场标题一】：玄关\n  - 线性摘要搬运记录：\n    - `[Chapter_1]`：摘要一\n</大总结(第0-3楼)>';

(async () => {
    console.log('\n[04] 总结');
    const chat = [
        { name: 'U', mes: 'go', is_user: true },
        { name: 'C', mes: '正文一 `[Chapter_1]`摘要一', is_user: false },
        { name: 'U', mes: 'ok', is_user: true },
        { name: 'C', mes: '正文二 `[Chapter_2]`摘要二', is_user: false },
    ];
    const app = boot({ chat, modelReply: DOC,
        expose: ['settings','chatData','generateBigSummary','regenerateBigSummary','renderBigSummary','compressBigSummary','restoreBigSummary','importBigSummary','requestSummaryViaChat','capturePendingSummary','listChapters','maxChapter','unitName','lastSummarizedChapter'] });
    await tick();
    const T = app.T(); const s = T.settings();

    // 楼层模式：包含隐藏楼层
    s.summary.countMode = 'floor';
    check('楼层模式计入所有消息', T.listChapters().length === 4);
    check('楼层最大值 = 3', T.maxChapter() === 3);
    check('单位为楼', T.unitName() === '楼');

    const b = await T.generateBigSummary();
    check('文档原样保存', b.rawText === DOC);
    check('范围 0-3', b.fromCh === 0 && b.toCh === 3, `${b.fromCh}-${b.toCh}`);
    check('提示词要求搬运而非重写', app.rec.lastSystemPrompt.includes('原样搬运') && app.rec.lastSystemPrompt.includes('绝对禁止再去读正文自行总结'));
    check('提示词保留高光格式约束', app.rec.lastSystemPrompt.includes('只输出 3-5 行') && app.rec.lastSystemPrompt.includes('40 字以内'));

    // 隐藏旧楼层后仍能继续总结（曾经的 bug：隐藏后总数缩水导致总结不了）
    chat[0].is_system = true; chat[1].is_system = true;
    chat.push({ name: 'C', mes: '新内容', is_user: false });
    check('隐藏楼层不影响进度', T.lastSummarizedChapter() === 3);
    const b2 = await T.generateBigSummary();
    check('隐藏后仍可继续总结', b2.fromCh === 4, `从 ${b2.fromCh} 开始`);

    // 章节模式
    T.chatData().summary.bigSummaries.length = 0;
    s.summary.countMode = 'chapter';
    check('章节模式读标签', T.listChapters().map((x) => x.chapter).join(',') === '1,2');
    check('单位为章', T.unitName() === '章');

    // 压缩与还原
    T.chatData().summary.bigSummaries.length = 0;
    s.summary.countMode = 'floor';
    const b3 = await T.generateBigSummary();
    const raw = b3.rawText;
    app.context.generateRaw = async (o) => { app.rec.lastSystemPrompt = o.systemPrompt; return '压缩后内容'; };
    await T.compressBigSummary(b3.id);
    check('压缩另存不覆盖原文', b3.level === 2 && b3.compressedText === '压缩后内容' && b3.rawText === raw);
    check('压缩指令保护原话', app.rec.lastSystemPrompt.includes('逐字原样保留'));
    T.restoreBigSummary(b3.id);
    check('还原无损', b3.level === 1 && T.renderBigSummary(b3) === raw);

    // 发到聊天 + 捕获
    T.chatData().summary.bigSummaries.length = 0;
    const req = await T.requestSummaryViaChat();
    check('通过斜杠命令发送', app.rec.slashCommands.some((c) => c.includes('/send') && c.includes('/trigger')));
    check('记录等待状态', T.chatData().summary.pending?.from === req.from);
    const got = T.capturePendingSummary('闲聊\n<大总结(第0-4楼)>\n内容\n</大总结(第0-4楼)>\n尾巴');
    check('从回复捕获存档', got === true && T.chatData().summary.bigSummaries.length === 1);
    check('标记为聊天生成', T.chatData().summary.bigSummaries[0].viaChat === true);
    check('清除等待状态', !T.chatData().summary.pending);
    check('无标签时不误捕获', T.capturePendingSummary('普通回复') === false);

    // 导入
    const ib = T.importBigSummary('手写档案', 10, 20);
    check('导入大总结', ib.imported === true && T.lastSummarizedChapter() === 20);

    summary('[04] 总结');
})();
