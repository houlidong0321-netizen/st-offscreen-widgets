/** 更新检查：目录名推导、404 与非 git 仓库的区分 */
const { boot, tick, check, summary } = require('./harness.cjs');

(async () => {
    console.log('\n[07] 更新检查');

    // 目录名推导：脚本直接位于扩展目录下（没有结尾斜杠）
    const cases = [
        ['http://localhost/scripts/extensions/third-party/ego-assistant/index.js', 'ego-assistant'],
        ['http://localhost/scripts/extensions/third-party/st-offscreen-widgets/index.js', 'st-offscreen-widgets'],
        ['http://localhost/scripts/extensions/third-party/My_Folder-123/index.js', 'My_Folder-123'],
    ];
    for (const [url, want] of cases) {
        let sent = null;
        const app = boot({
            scriptUrl: url,
            expose: ['checkExtensionUpdate'],
            fetch: async (u, o) => { sent = JSON.parse(o.body); return { ok: true, status: 200, json: async () => ({ isUpToDate: true, currentCommitHash: 'abc1234' }), text: async () => '' }; },
        });
        await tick();
        await app.T().checkExtensionUpdate({ quiet: true });
        check(`目录名推导 ${want}`, sent && sent.extensionName === want, sent ? sent.extensionName : '(未发出请求)');
    }

    // 404 → 应报"找不到目录"，而不是"不是 git 仓库"
    const app404 = boot({
        expose: ['checkExtensionUpdate', 'renderUpdateSection'],
        fetch: async () => ({ ok: false, status: 404, json: async () => ({}), text: async () => 'not found' }),
    });
    await tick();
    const st404 = await app404.T().checkExtensionUpdate({ quiet: true });
    check('404 被单独标记', st404.notFound === true);
    check('404 不会被当成"已检查"', st404.checked === false);
    const $p = app404.$('<div><div id="ow_update_status"></div></div>');
    app404.T().renderUpdateSection($p);
    check('404 文案指向目录名不一致', $p.find('#ow_update_status').html().includes('找不到名为'));

    // 200 + 空 hash → 确实不是 git 仓库
    const appNoGit = boot({
        expose: ['checkExtensionUpdate', 'renderUpdateSection'],
        fetch: async () => ({ ok: true, status: 200, json: async () => ({ currentBranchName: '', currentCommitHash: '', isUpToDate: true, remoteUrl: '' }), text: async () => '' }),
    });
    await tick();
    const stNoGit = await appNoGit.T().checkExtensionUpdate({ quiet: true });
    check('非 git 仓库：已检查但无 hash', stNoGit.checked === true && !stNoGit.currentCommitHash && stNoGit.notFound === false);
    const $p2 = appNoGit.$('<div><div id="ow_update_status"></div></div>');
    appNoGit.T().renderUpdateSection($p2);
    check('非 git 文案正确', $p2.find('#ow_update_status').html().includes('不是 Git 仓库'));

    // 正常有更新
    const appUpd = boot({
        expose: ['checkExtensionUpdate'],
        fetch: async () => ({ ok: true, status: 200, json: async () => ({ currentBranchName: 'main', currentCommitHash: 'abc1234def', isUpToDate: false, remoteUrl: 'r' }), text: async () => '' }),
    });
    await tick();
    const stU = await appUpd.T().checkExtensionUpdate({ quiet: true });
    check('检出有新版本', stU.checked === true && stU.isUpToDate === false && stU.currentCommitHash === 'abc1234def');

    // 两种安装位置：先试当前用户(global:false)，失败再试全局(global:true)
    const seen = [];
    const appUser = boot({
        folder: 'st-offscreen-widgets',
        expose: ['checkExtensionUpdate'],
        fetch: async (u, o) => {
            const b = JSON.parse(o.body); seen.push(b.global);
            // 模拟"只装给自己"：global:false 命中
            if (b.global === false) return { ok: true, status: 200, json: async () => ({ currentBranchName: 'main', currentCommitHash: 'aaa1111', isUpToDate: true }), text: async () => '' };
            return { ok: false, status: 404, text: async () => 'nope' };
        },
    });
    await tick();
    const stUser = await appUser.T().checkExtensionUpdate({ quiet: true });
    check('优先按"当前用户"查询', seen[0] === false);
    check('用户扩展被正确识别', stUser.checked === true && stUser.global === false && stUser.installKind === '当前用户');

    const seen2 = [];
    const appGlobal = boot({
        folder: 'st-offscreen-widgets',
        expose: ['checkExtensionUpdate'],
        fetch: async (u, o) => {
            const b = JSON.parse(o.body); seen2.push(b.global);
            if (b.global === true) return { ok: true, status: 200, json: async () => ({ currentBranchName: 'main', currentCommitHash: 'bbb2222', isUpToDate: false }), text: async () => '' };
            return { ok: false, status: 404, text: async () => 'nope' };
        },
    });
    await tick();
    const stG = await appGlobal.T().checkExtensionUpdate({ quiet: true });
    // 初始化时已经静默查过一轮，这里只看最后两次的顺序
    const tail = seen2.slice(-2);
    check('用户目录没有则回退到全局', tail[0] === false && tail[1] === true, JSON.stringify(seen2));
    check('全局扩展被正确识别', stG.checked === true && stG.global === true && stG.installKind === '全局（所有用户）');

    // 目录名不带 third-party 时也不能崩
    const appOdd = boot({
        scriptUrl: 'http://localhost/some/other/path/index.js',
        expose: ['checkExtensionUpdate'],
        fetch: async () => ({ ok: false, status: 404, text: async () => '' }),
    });
    await tick();
    const stOdd = await appOdd.T().checkExtensionUpdate({ quiet: true });
    check('异常路径不崩溃', stOdd.notFound === true);

    summary('[07] 更新检查');
})();
