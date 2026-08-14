/** 界面：组件预览、折叠持久化、隐藏楼层不丢数据、收藏夹 */
const { boot, tick, check, summary, readSource } = require('./harness.cjs');

(async () => {
    console.log('\n[06] 界面与数据安全');
    const src = readSource();

    // 预览 srcdoc：不能量 documentElement（会形成高度反馈循环，一行一行变高）
    const a = src.indexOf('    function buildPreviewSrcdoc(innerHtml, frameId) {');
    const b = src.indexOf('    // 父页面统一监听所有预览 iframe');
    const build = new Function('return (' + src.slice(a, b).trim().replace(/^function buildPreviewSrcdoc/, 'function') + ')')();
    const doc = build('<p>hi</p>', 'w1');
    check('预览量的是内容容器而非 documentElement', doc.includes('root.getBoundingClientRect') && !doc.includes('documentElement.scrollHeight'));
    check('高度不变时不重复上报', doc.includes('if(h===last) return;'));
    check('iframe 内部可滚动', doc.includes('overflow-y:auto'));
    check('script 标签闭合正确', (doc.match(/<script>/g) || []).length === 1 && (doc.match(/<\/script>/g) || []).length === 1);

    // 高度上限
    const calc = (contentH, mode, vh = 1000) => {
        let h = Math.min(Math.max(contentH, 80), 20000);
        if (mode !== 'full') { const cap = mode === 'short' ? vh * 0.4 : mode === 'tall' ? vh * 0.85 : vh * 0.6; h = Math.min(h, Math.round(cap)); }
        return h;
    };
    check('短内容贴合实际高度', calc(300, 'mid') === 300);
    check('长内容截到上限', calc(5000, 'mid') === 600);
    check('不限模式不截断', calc(5000, 'full') === 5000);

    // 隐藏楼层：必须先落盘再隐藏，否则扩展数据会被聊天重载冲掉
    const chat = [{ name: 'C', mes: 'a', is_user: false }, { name: 'U', mes: 'b', is_user: true }, { name: 'C', mes: 'c', is_user: false }];
    const app = boot({ chat, expose: ['chatData', 'openHideDialog', 'importBigSummary'] });
    await tick();
    const T = app.T();
    T.importBigSummary('我的大总结', 0, 1);
    const $p = app.$('<div></div>').appendTo(app.window.document.body);
    T.openHideDialog($p);
    await tick(100);
    app.$('.ow-sub-overlay #ow_hide_from').val(0);
    app.$('.ow-sub-overlay #ow_hide_to').val(1);
    app.rec.slashCommands.length = 0;
    const flushedBefore = app.rec.metaFlushed;
    app.$('.ow-sub-overlay #ow_hide_do').trigger('click');
    await tick(200);
    check('隐藏前先强制落盘', app.rec.metaFlushed > flushedBefore);
    check('走酒馆自带 /hide', app.rec.slashCommands.some((c) => c === '/hide 0-1'));
    check('大总结未丢失', T.chatData().summary.bigSummaries.length === 1);
    check('不再调用 reloadCurrentChat', !src.includes('reloadCurrentChat'));

    // 收藏夹
    const app2 = boot({ expose: ['settings', 'chatData', 'addFavorite', 'isFavorited', 'favs'] });
    await tick();
    const T2 = app2.T();
    const w = { id: 'w1', name: '论坛帖' };
    T2.settings().widgets.push(w);
    T2.chatData().widgetResults['w1'] = { html: '<h1>A</h1>', updatedAt: Date.now() };
    const item = T2.addFavorite(w, null);
    check('收藏成功并记录元信息', !!item && item.charName === 'C' && item.userName === 'U' && item.savedAt > 0);
    check('已收藏可识别', T2.isFavorited('w1') === true);
    T2.chatData().widgetResults['w1'].html = '<h1>改过了</h1>';
    check('重新生成后视为未收藏', T2.isFavorited('w1') === false);
    check('快照不受后续改动影响', T2.favs().items[0].html === '<h1>A</h1>');

    summary('[06] 界面与数据安全');
})();
