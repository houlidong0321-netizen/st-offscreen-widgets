/** 结构与完整性：语法、重复声明、函数引用、面板渲染 */
const { boot, tick, check, summary, syntaxCheckSource, readSource } = require('./harness.cjs');

(async () => {
    console.log('\n[01] 结构与完整性');
    const src = readSource();

    const syn = syntaxCheckSource();
    check('语法检查通过', syn.ok, syn.ok ? '' : syn.message.split('\n')[0]);

    // 重复的顶层声明（曾经因为脚本替换导致函数被声明两次）
    const names = [...src.matchAll(/^\s{4}(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
    const dup = names.filter((n, i) => names.indexOf(n) !== i);
    check('无重复函数声明', dup.length === 0, dup.join(', '));

    // 调用了但没定义的函数（曾经因为整段替换误删过函数）
    const defined = new Set(names);
    for (const m of src.matchAll(/^\s*(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=/gm)) defined.add(m[1]);
    const builtins = new Set(['if','for','while','switch','catch','return','function','typeof','await','new','Number','String','Boolean','Array','Object','JSON','Date','Math','Set','Map','Promise','fetch','confirm','alert','prompt','parseInt','parseFloat','isNaN','setTimeout','console','jQuery','$','Error','URL','RegExp','of','do','else','try','async','rgba','getContext','generateRaw','min','ResizeObserver','importEmbeddedWorldInfo']);
    const called = [...new Set([...src.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => m[1]))];
    const missing = called.filter((n) => !defined.has(n) && !builtins.has(n) && !/^[a-z]$/.test(n));
    // 局部变量/回调参数会误报，只看首字母是 render/open/build/generate 这类明确的模块函数
    const realMissing = missing.filter((n) => /^(render|open|build|generate|apply|save|load|update|scan|parse|normalize|compress|restore|import|list|count|resolve|test|set|get|is|maybe)[A-Z]/.test(n));
    check('无未定义的模块函数', realMissing.length === 0, realMissing.join(', '));

    // 七个标签页都能渲染出内容
    const app = boot({ chat: [{ name: 'C', mes: 'hi', is_user: false }] });
    await tick();
    const btn = app.window.document.querySelector('#ow_menu_button');
    check('菜单入口已挂载', !!btn);
    app.$(btn).trigger('click');
    await tick(300);

    for (const p of ['widgets', 'offscreen', 'plot', 'summary', 'lore', 'favorites', 'settings']) {
        const el = app.window.document.querySelector(`.ow-panel[data-panel="${p}"]`);
        const len = el ? el.innerHTML.trim().length : -1;
        check(`面板渲染 ${p}`, len > 100, `${len} 字符`);
    }

    // 设置分组顺序
    const groups = [...app.window.document.querySelectorAll('.ow-group')].map((g) => g.dataset.group);
    const want = ['api', 'widgets', 'tables', 'plot', 'summary', 'lore', 'worldinfo', 'prompts', 'log'];
    check('设置分组顺序正确', JSON.stringify(groups.slice(0, 9)) === JSON.stringify(want), groups.join(','));

    summary('[01] 结构与完整性');
})();
