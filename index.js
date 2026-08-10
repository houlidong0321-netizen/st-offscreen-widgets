// ============================================================================
// Ego 小助手 (Ego Assistant) for SillyTavern — 组件生成 · 镜头之外表格 · 收藏夹
// ----------------------------------------------------------------------------
// 使用 SillyTavern.getContext() 全局接口编写，避免相对路径导入随版本变化失效。
// 参考: https://docs.sillytavern.app/for-contributors/writing-extensions/
// ============================================================================

(function () {
    'use strict';

    const MODULE_NAME = 'offscreen_widgets';
    const ctx = () => SillyTavern.getContext();

    // ------------------------------------------------------------------
    // Git 仓库信息 / 更新检查
    // 酒馆用 <script type="module"> 方式加载扩展入口文件（见酒馆源码 extensions.js 的
    // addExtensionScript），module 脚本不会设置 document.currentScript（始终是 null），
    // 但可以用 import.meta.url 可靠地拿到自己在磁盘上的安装路径，从而推导出调用酒馆内置的
    // /api/extensions/version、/api/extensions/update 接口所需要的 extensionName 参数
    // ——酒馆前端把这个参数拼成"third-party/<文件夹名>"后去掉字面量"third-party"这几个字符
    // （保留紧跟其后的斜杠），本处按同样规则复现，避免请求路径拼错导致 404。
    // ------------------------------------------------------------------
    const EXT_NAME = 'Ego 小助手';
    const EXT_VERSION = '2.3.2';
    const REPO_URL = 'https://github.com/houlidong0321-netizen/st-offscreen-widgets.git';

    function getExtensionIdParam() {
        try {
            const url = new URL(import.meta.url);
            const match = url.pathname.match(/\/extensions\/(third-party\/[^/]+)\//);
            if (match) return match[1].replace('third-party', '');
        } catch (e) { /* 忽略，走回退值 */ }
        return '/st-offscreen-widgets'; // 回退：按本仓库默认安装文件夹名推断
    }
    const EXTENSION_ID_PARAM = getExtensionIdParam();

    // 更新状态缓存，供菜单角标 / 弹窗内横幅 / 设置页状态区共用，避免重复请求
    const updateState = {
        checked: false,
        checking: false,
        isUpToDate: true,
        currentCommitHash: '',
        currentBranchName: '',
        remoteUrl: '',
        global: false,
    };

    async function checkExtensionUpdate({ quiet = false } = {}) {
        if (updateState.checking) return updateState;
        updateState.checking = true;
        try {
            const c = ctx();
            const headers = c.getRequestHeaders ? c.getRequestHeaders() : { 'Content-Type': 'application/json' };
            // 全局扩展与用户扩展在前端 URL 上是同一个 /scripts/extensions/third-party/ 路径，
            // 无法从路径分辨，因此两种都试一遍：先当作用户扩展，再当作全局扩展。
            let lastErr = '';
            for (const isGlobal of [false, true]) {
                try {
                    const res = await fetch('/api/extensions/version', {
                        method: 'POST',
                        headers,
                        body: JSON.stringify({ extensionName: EXTENSION_ID_PARAM, global: isGlobal }),
                    });
                    if (!res.ok) {
                        lastErr = `HTTP ${res.status}`;
                        log('debug', 'system', `更新检查（global=${isGlobal}）返回 ${res.status}，尝试下一种安装方式`);
                        continue;
                    }
                    const data = await res.json();
                    updateState.checked = true;
                    updateState.global = isGlobal;
                    updateState.isUpToDate = !!data.isUpToDate;
                    updateState.currentCommitHash = data.currentCommitHash || '';
                    updateState.currentBranchName = data.currentBranchName || '';
                    updateState.remoteUrl = data.remoteUrl || '';
                    if (!quiet) {
                        log('info', 'system', `扩展更新检查完成（${isGlobal ? '全局' : '用户'}扩展）：${updateState.isUpToDate ? '已是最新版本' : '发现新版本'}（本地提交 ${updateState.currentCommitHash.slice(0, 7) || '未知'}）`, data);
                    }
                    return updateState;
                } catch (err) {
                    lastErr = err.message || String(err);
                    log('debug', 'system', `更新检查请求出错（global=${isGlobal}）：${lastErr}`);
                }
            }
            log('warn', 'system', `更新检查未成功（用户扩展与全局扩展两种方式都失败，最后错误：${lastErr}）。extensionName=${EXTENSION_ID_PARAM}。若安装目录名与仓库名不同，或不是用 Git 地址安装的，就会出现这种情况。`);
        } finally {
            updateState.checking = false;
            updateMenuBadge();
        }
        return updateState;
    }

    async function performExtensionUpdate() {
        const c = ctx();
        log('info', 'system', `开始拉取扩展更新（extensionName=${EXTENSION_ID_PARAM}, global=${updateState.global}）…`);
        const headers = c.getRequestHeaders ? c.getRequestHeaders() : { 'Content-Type': 'application/json' };
        const res = await fetch('/api/extensions/update', {
            method: 'POST',
            headers,
            body: JSON.stringify({ extensionName: EXTENSION_ID_PARAM, global: !!updateState.global }),
        });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(`HTTP ${res.status} ${text.slice(0, 200)}`);
        }
        const data = await res.json();
        log('info', 'system', '扩展更新请求完成', data);
        updateState.checked = true;
        updateState.isUpToDate = true;
        if (data.shortCommitHash) updateState.currentCommitHash = data.shortCommitHash;
        updateMenuBadge();
        return data;
    }

    function updateMenuBadge() {
        const $badge = $('#ow_menu_update_badge');
        if (!$badge.length) return;
        $badge.toggle(updateState.checked && !updateState.isUpToDate);
    }

    // 弹窗打开时，如果有更新，在标签页下方插入一条可操作的横幅（比设置页里的状态区更醒目）
    function renderUpdateBanner($panelRoot) {
        $panelRoot.find('#ow_update_banner').remove();
        if (!updateState.checked || updateState.isUpToDate) return;
        const $banner = $(`
          <div id="ow_update_banner" class="ow-update-banner">
            <span>🔔 检测到新版本（当前提交 ${escapeHtml((updateState.currentCommitHash || '').slice(0, 7) || '未知')}），可直接从仓库拉取更新。</span>
            <span>
              <button class="ow-btn ow-primary" id="ow_update_now_btn">立即更新</button>
              <button class="ow-btn" id="ow_update_reload_btn" style="display:none;">刷新页面</button>
            </span>
          </div>`);
        $panelRoot.find('.ow-tabs').after($banner);
        $banner.find('#ow_update_now_btn').on('click', async function () {
            const $btn = $(this);
            $btn.prop('disabled', true).text('更新中…');
            try {
                const result = await performExtensionUpdate();
                toast(`已更新到 ${result.shortCommitHash || '最新版本'}，需要刷新页面才能生效`, 'success');
                $banner.find('span').first().text('✅ 已更新，刷新页面后生效。');
                $btn.hide();
                $banner.find('#ow_update_reload_btn').show();
            } catch (err) {
                toast(`更新失败：${err.message || err}，详见日志标签页`, 'error');
                $btn.prop('disabled', false).text('立即更新');
            }
        });
        $banner.find('#ow_update_reload_btn').on('click', () => location.reload());
    }

    // 酒馆的 extension_prompt_types 枚举值（见 public/script.js），此处静态复制，
    // 避免额外导入。若未来酒馆更改枚举值，可在此处调整。
    const PROMPT_TYPES = { IN_PROMPT: 0, IN_CHAT: 1, BEFORE_PROMPT: 2 };
    const INJECT_KEY_WIDGETS = `${MODULE_NAME}_widgets`;
    const INJECT_KEY_OFFSCREEN = `${MODULE_NAME}_offscreen`;
    const INJECT_KEY_PLOT = `${MODULE_NAME}_plot`;

    // ------------------------------------------------------------------
    // 日志诊断模块：记录每一步关键动作（发送了什么/收到了什么/解析是否成功），
    // 仅保存在内存中（刷新页面会清空），供出问题时导出/复制给开发者排查。
    // ------------------------------------------------------------------
    const MAX_LOGS = 300;
    const logs = [];
    let $logPanel = null; // 当前打开的日志面板（若存在），用于实时刷新

    function log(level, tag, msg, data) {
        const entry = {
            time: Date.now(),
            level, // 'info' | 'warn' | 'error' | 'debug'
            tag,   // 'trigger' | 'request' | 'response' | 'parse' | 'inject' | 'ui' | 'system'
            msg,
            data: data !== undefined ? safeStringify(data) : undefined,
        };
        logs.push(entry);
        if (logs.length > MAX_LOGS) logs.shift();
        const consoleFn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
        consoleFn(`[Ego][${tag}] ${msg}`, data !== undefined ? data : '');
        if ($logPanel) renderLogEntries($logPanel);
        return entry;
    }

    function safeStringify(data) {
        try {
            if (typeof data === 'string') return data;
            if (data instanceof Error) return `${data.name}: ${data.message}\n${data.stack || ''}`;
            return JSON.stringify(data, null, 2);
        } catch (e) {
            return String(data);
        }
    }

    function clearLogs() {
        logs.length = 0;
        if ($logPanel) renderLogEntries($logPanel);
    }

    function exportLogsText() {
        return logs.map((e) => {
            const t = new Date(e.time).toLocaleString();
            return `[${t}] [${e.level.toUpperCase()}] [${e.tag}] ${e.msg}${e.data ? `\n${e.data}` : ''}`;
        }).join('\n\n');
    }

    // ------------------------------------------------------------------
    // 默认设置 & 持久化（全局设置存 extension_settings，随存档/浏览器持久化）
    // ------------------------------------------------------------------
    const defaultSettings = () => ({
        widgets: [],
        triggerMode: 'manual', // 'manual' | 'auto'
        historyDepth: 5,
        includeCharBook: false,
        includeWorldInfo: false,
        injectWidgets: false,
        injectPosition: 'IN_CHAT',
        injectDepth: 0,
        offscreen: {
            enabled: false,
            followWidgets: true,   // 表格随组件一起生成（此时楼层间隔与上下文楼层跟随组件设置）
            historyDepth: 5,       // 仅在不跟随组件时生效
            injectTables: false,
            injectPosition: 'IN_CHAT',
            injectDepth: 0,
        },
        api: { mode: 'system', url: '', key: '', model: '', modelList: [] },
        theme: { mode: 'system', customCss: '' },
        prompts: {
            widgetSystemPrompt: DEFAULT_WIDGET_SYSTEM_PROMPT,
            offscreenPreamble: DEFAULT_OFFSCREEN_PREAMBLE,
            plotSystemPrompt: DEFAULT_PLOT_SYSTEM_PROMPT,
            plotInjectTemplate: DEFAULT_PLOT_INJECT_TEMPLATE,
        },
        offscreenTables: defaultOffscreenTables(),
        // 收藏夹：跨聊天全局保存，folders 为文件夹，items 为收藏的组件快照
        favorites: { folders: [{ id: 'default', name: '默认收藏夹', createdAt: Date.now() }], items: [] },
        // 剧情推演
        plot: {
            customEvents: '',
            historyDepth: 20,
            minEvents: 10,
            injectEnabled: true,
            injectPosition: 'IN_CHAT',
            injectDepth: 1,
            sendCurrent: false, // 生成时是否把当前推演一并发给模型（默认不发）
            directions: defaultPlotDirections(),
        },
        // 世界书/聊天书发送设置：key 形如 "书名::条目uid" -> true/false（用户在本扩展内的手动覆盖）；
        // 没有覆盖记录的条目，默认发送状态跟随该条目在酒馆世界书编辑器里的"启用/禁用"开关。
        worldInfoOverrides: {},
        // 自动触发的细分开关：除了"检测到正文闭合标签"，还支持按楼层数（消息条数）独立触发
        // 组件生成与表格生成，两者的间隔互不影响。
        autoTriggers: {
            onContentTag: true,
            widgetsByFloor: { enabled: false, interval: 5 },
            offscreenByFloor: { enabled: false, interval: 10 },
        },
    });

    function deepMergeDefaults(target, defaults) {
        for (const k of Object.keys(defaults)) {
            if (target[k] === undefined) {
                target[k] = JSON.parse(JSON.stringify(defaults[k]));
            } else if (
                typeof defaults[k] === 'object' && defaults[k] !== null && !Array.isArray(defaults[k]) &&
                typeof target[k] === 'object' && target[k] !== null && !Array.isArray(target[k])
            ) {
                deepMergeDefaults(target[k], defaults[k]);
            }
        }
        return target;
    }

    function settings() {
        const es = ctx().extensionSettings;
        if (!es[MODULE_NAME]) es[MODULE_NAME] = {};
        deepMergeDefaults(es[MODULE_NAME], defaultSettings());
        // 迁移：旧版本的发展方向只有 {id,name,enabled}，没有 prompt 字段。
        // deepMergeDefaults 不会深入数组元素，这里按 id 补上内置方向的默认提示词。
        const st = es[MODULE_NAME];
        if (Array.isArray(st.plot?.directions)) {
            const builtin = defaultPlotDirections();
            for (const d of st.plot.directions) {
                if (d.prompt === undefined) {
                    d.prompt = builtin.find((b) => b.id === d.id)?.prompt || '';
                }
            }
        }
        return st;
    }

    function saveSettings() {
        ctx().saveSettingsDebounced();
    }

    // 每聊天数据（组件生成结果 / 镜头之外四张表）随存档保存
    function chatData() {
        const c = ctx();
        const emptyOffscreen = () => ({ tables: {}, updatedAt: null });
        if (!c.chatMetadata[MODULE_NAME]) {
            c.chatMetadata[MODULE_NAME] = { widgetResults: {}, offscreen: emptyOffscreen(), autoTriggerState: { lastWidgetFloor: 0, lastOffscreenFloor: 0 } };
        }
        if (!c.chatMetadata[MODULE_NAME].offscreen) {
            c.chatMetadata[MODULE_NAME].offscreen = emptyOffscreen();
        }
        if (!c.chatMetadata[MODULE_NAME].autoTriggerState) {
            c.chatMetadata[MODULE_NAME].autoTriggerState = { lastWidgetFloor: 0, lastOffscreenFloor: 0 };
        }
        const off = c.chatMetadata[MODULE_NAME].offscreen;
        // 迁移旧版存档：以前每张表是 offscreen 下的一个平铺数组字段，
        // 现在统一收进 offscreen.tables[key]，以支持用户自定义表格。
        if (!off.tables) off.tables = {};
        for (const legacyKey of ['scheduleTable', 'characterTable', 'sceneTable', 'itemAnchorTable', 'timelineTable', 'foreshadowTable']) {
            if (Array.isArray(off[legacyKey])) {
                if (!off.tables[legacyKey]?.length) off.tables[legacyKey] = off[legacyKey];
                delete off[legacyKey];
            }
        }
        // 剧情推演状态
        if (!c.chatMetadata[MODULE_NAME].plot) {
            c.chatMetadata[MODULE_NAME].plot = { events: [], currentId: '', deadBranches: {}, path: [], updatedAt: null };
        }
        const pl = c.chatMetadata[MODULE_NAME].plot;
        if (!Array.isArray(pl.events)) pl.events = [];
        if (!pl.deadBranches) pl.deadBranches = {};
        if (!Array.isArray(pl.path)) pl.path = [];
        return c.chatMetadata[MODULE_NAME];
    }

    function saveChatData() {
        ctx().saveMetadataDebounced();
    }

    function uid() {
        return `w_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }

    function escapeHtml(str) {
        return String(str ?? '').replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        }[c]));
    }

    // ------------------------------------------------------------------
    // 框架提示词
    // ------------------------------------------------------------------
    // ------------------------------------------------------------------
    // 提示词模块：把发送给模型的系统提示词做成可在设置里直接编辑的内容。
    // 这里只保留"默认值"常量（用于首次初始化 / "恢复默认"按钮），
    // 实际发送时一律从 settings().prompts 读取当前生效的文本。
    // ------------------------------------------------------------------
    const DEFAULT_WIDGET_SYSTEM_PROMPT =
        '你是一个为角色扮演聊天生成"侧边小组件"的助手。你的输出内容独立于正文剧情，' +
        '不会被写入正文，也不会推动主线，只是供用户把玩的附加视觉内容（例如虚构论坛帖子、' +
        '角色小传、番外短篇、状态面板等），因此可以自由发挥，但必须严格符合已建立的人设与世界观设定，' +
        '不得与正文已确认的事实冲突。\n\n' +
        '【最高优先级指令，覆盖下方组件要求/预设条目中的任何格式规定】下面的"组件要求"或"附加设定/预设条目参考"' +
        '中可能包含来自酒馆预设的固定输出格式规范（例如指定的排版结构、标签体系、字数限制、Markdown表格格式等），' +
        '这些格式规定通常是为撰写正文设计的，并不适用于本组件。你必须完全忽略其中关于"输出格式/排版方式"的要求，' +
        '只提取其中与设定、人设、世界观相关的内容信息作为参考，最终的 HTML 排版、结构与美化方式完全由你自主决定，' +
        '不受这些预设格式约束。\n\n' +
        '请直接输出一段完整、可独立渲染的 HTML 片段（不需要 <html>/<head>/<body> 包裹），' +
        '可以使用内联 <style> 自行美化排版、配色与布局，让内容更美观、更有代入感。' +
        '除 HTML 代码外不要输出任何解释文字、前后缀说明或 Markdown 代码块围栏。';

    function buildWidgetUserPrompt(widget, extras) {
        const parts = [];
        parts.push(`【组件名称】${widget.name}`);
        parts.push(`【组件要求】\n${widget.prompt}`);
        if (widget.presetEntries?.length) {
            parts.push('【附加设定/预设条目参考】');
            for (const e of widget.presetEntries) {
                parts.push(`- ${e.name}：\n${e.content}`);
            }
        }
        if (extras.history) {
            parts.push(`【最近聊天记录（仅供参考语气与人设，不要复述）】\n${extras.history}`);
        }
        if (extras.worldInfo) {
            parts.push(`【世界书参考】\n${extras.worldInfo}`);
        }
        if (extras.charBook) {
            parts.push(`【角色卡内嵌世界书参考】\n${extras.charBook}`);
        }
        return parts.join('\n\n');
    }

    // 表格生成：默认表格定义。每张表自带"规则说明(spec)"，提示词按启用的表动态拼装，
    // 用户在「表格管理」里增删表或改规则，提示词随之变化，不需要改代码。
    function defaultOffscreenTables() {
        return [
            {
                key: 'scheduleTable', jsonKey: 'schedule_table', title: '日程表', enabled: true,
                columns: [
                    { field: 'role', label: '角色' },
                    { field: 'routine', label: '固定日程规律' },
                    { field: 'seasonal', label: '时节性必然事件' },
                    { field: 'pool', label: '弹性事务参考池' },
                ],
                spec: `本表只记录正文中尚未提及的角色日常生活信息，由"身份+当前故事时间点"自然推导得出，不受"正文触发原则"约束。
"固定日程规律"：日常性、按周期反复发生的日程锚点，含具体星期与时段。
"时节性必然事件"：结合角色身份与当前故事日期所处季节/月份/节日/星期推导出的大概率事务，写法为"时间节点：事务"，无关联时留空"—"。
"弹性事务参考池"：与角色身份/性格相符、结合当前季节/星期/天气合理存在的偶发小事清单，用中文分号分隔多项，不要求真实发生过。
时节性事件时间窗口过去后应删除；固定日程规律与弹性事务参考池仅在角色身份根本变化时整体更新。`,
            },
            {
                key: 'characterTable', jsonKey: 'character_table', title: '角色表', enabled: true,
                columns: [
                    { field: 'name', label: '姓名' },
                    { field: 'alias', label: '昵称' },
                    { field: 'relation', label: '与用户的关系' },
                    { field: 'location', label: '当前位置与正在做的事' },
                    { field: 'attitude', label: '对用户的态度' },
                ],
                spec: `记录所有已出场角色的身份信息与实时状态，确保离场角色也拥有可查证的当前生活状态。
本表【不受"正文触发原则"约束】，可以合理描写正文中不在场角色此刻在做的事。
"当前位置与正在做的事"：绝对上帝视角的物理位置与客观动作，不带情绪与内心活动，禁止写"未知"。
"对用户的态度"：用2-3个简写标签描述当前状态快照。
不删除，永久保留，即使角色长期不出场也不清理；每次更新都应覆盖"当前位置与正在做的事"字段。`,
            },
            {
                key: 'sceneTable', jsonKey: 'scene_table', title: '场景表', enabled: true,
                columns: [
                    { field: 'tag', label: '标签' },
                    { field: 'name', label: '场景名称' },
                    { field: 'location', label: '地理位置/距离参照' },
                    { field: 'structure', label: '建筑/环境构造细节' },
                    { field: 'usage', label: '用途' },
                ],
                spec: `【严格遵循"正文触发原则"】
1. 收录标准：仅收录具备明确功能或剧情停留价值的室内/室外固定场所。不收录通道类（马路、街道、走廊、过道、楼梯间）。不收录建筑附属部件（门、窗、墙）。不收录未发生任何剧情对话或动作的经过性地点。每次生成如发现之前收录过的条目不符合以上标准，立即删除。
2. 基本原则：做加法，不做覆盖。同一场景再次出现时，若正文补充了新细节，追加到对应字段。仅当同一特征出现前后矛盾的描写时，以最新描写为准并删除旧内容。
3. 失活清理规则（维护动作，不受"正文触发原则"约束）：若某场景标签连续10章未在正文中出现，且当前"核心待办事项表"与"伏笔表"中均无条目指向该场景，下次生成时直接删除该行。若10章内再次出现或被其他表引用，则保留，计数清零重算。
4. 标签：\`[Scene_X]\`，X按场景首次出场顺序从1递增。
5. 场景名称：只写一层整体空间，如"A的公寓""街角咖啡馆"。
6. 地理位置/距离参照：参照物可用场景标签或通用地标。
7. 建筑/环境构造细节：仅记录正文明确描写的客观物理存在。禁止写依赖时间/天气/氛围的感官评价（如"灯光昏暗"）。子空间用"功能区：具体客观陈设"格式追加。
8. 用途：仅写正文明确提及或被角色行为证实的绝对物理化用途。禁止写功能性用途（如"施压用场景"）。
9. 正文未描写的字段留空，禁止想象脑补。`,
            },
            {
                key: 'itemAnchorTable', jsonKey: 'item_anchor_table', title: '物品轨迹表', enabled: true,
                columns: [
                    { field: 'tag', label: '标签' },
                    { field: 'name', label: '物品名称' },
                    { field: 'chapters', label: '关联章节' },
                    { field: 'location', label: '当前位置' },
                    { field: 'status', label: '状态' },
                ],
                spec: `【严格遵循"正文触发原则"】
1. 收录标准，仅收录满足以下任一条件的物品：
   - 纪念意义：角色主动赠予、留存、珍藏的物品，或与角色重大过去强关联的信物。
   - 剧情杠杆：对后文剧情发展可能产生关键影响的物品。
   - 禁止收录手机，除非离开主人身边。发现不合规的手机项立刻删掉。
2. 终态判定（两类物品标准不同）：
   - 剧情杠杆类：所关联的剧情段落明确结束后，下一轮删除该行。
   - 纪念意义类：不因单段剧情结束而删除，仅当正文明确描写不可逆处置（被清走、烧毁、永久赠予且对方已带离场景、明确证实无法找回）才视为终态，下一轮删除。若只描写"扔进垃圾桶/藏起来/丢在某处"但未描写后续被清走或销毁，视为"可逆位置"，继续保留追踪，位置字段照实填当前所在处。
3. 标签：\`[Item_Anchor_X]\`，X按首次出场顺序从1递增，终身固定不可变更。
4. 物品名称：必须含可辨识的描述性特征。虚拟物品（照片、文件等）需写清上一级物品，如"有着XX照片的XX的手机"，位置为手机的位置。
5. 关联章节：首次出现和移动的章节标签\`[Chapter_X]\`，可多个。
6. 当前位置：角色持有写"A的口袋"；场景内位置写"A书房抽屉\`[Scene_1]\`"。禁止自创场景标签，只能引用场景表已有的标签。
7. 状态：按第2条判定，标注"留存"或"待删（下轮删除）"。`,
            },
            {
                key: 'timelineTable', jsonKey: 'timeline_table', title: '核心待办事项表', enabled: true,
                columns: [
                    { field: 'time', label: '时间' },
                    { field: 'task', label: '事项' },
                    { field: 'chapter', label: '关联章节' },
                ],
                spec: `1. 收录范围：只追踪"尚未开始"的待办事项。一旦该事项在正文中开始发生（无论持续几章），下一轮立即整行删除——进行中及之后的发展由正文、场景表、角色表自然承载。
2. 更新原则：严格根据上一轮待办表和本章新正文更新。若正文未推进任何待办进度，则完全继承旧表，不许妄动。
3. 时间：必须是确切日期与时间节点（如 2023.11.06 14:00）。禁止模糊表述（"下周""明天""两小时后"）。无具体时分刻度则填"待定"或"全天"。
4. 事项：简写清楚具体的任务或事件。
5. 关联章节：只记录该事项**首次被提及/确立**的那一个章节标签\`[Chapter_X]\`，不随反复提起而追加。`,
            },
            {
                key: 'foreshadowTable', jsonKey: 'foreshadow_table', title: '伏笔表', enabled: true,
                columns: [
                    { field: 'tag', label: '标签' },
                    { field: 'content', label: '内容' },
                    { field: 'chapter', label: '埋设章节' },
                    { field: 'status', label: '状态' },
                ],
                spec: `1. 收录标准：正文中出现的、尚未解释清楚的异常细节、隐藏信息、角色未说明的反常举动或态度。
2. 更新原则：只在正文明确埋下新伏笔时新增，只在正文明确回收（谜底揭晓/信息被说明）时把状态改为"已回收"，已回收的伏笔下一轮整行删除。不因时间推移或长期未提及而清理——不受场景表那类失活清理规则约束。
3. 标签：\`[Foreshadow_X]\`，X按首次出现顺序从1递增。
4. 内容：简要描述伏笔本身，需能让人一眼回忆起是什么事，不写"某某很奇怪"这类无信息量记录。
5. 埋设章节：首次出现的章节标签\`[Chapter_X]\`。
6. 状态：仅限"未回收""已回收"。`,
            },
        ];
    }

    const DEFAULT_OFFSCREEN_PREAMBLE = `你是一个为角色扮演故事维护"镜头之外"状态数据库的助手。你需要维护下列结构化表格。
内容绝不能与正文已确认的剧情冲突，也不能提前揭示正文尚未发生、但即将由用户或主角亲自经历的关键转折。

# 总原则
- "正文触发原则"（仅适用于下方明确标注遵循该原则的表）：
  · 正文中明确描写了变化 → 允许更新对应表格字段。
  · 正文中未提及 → 必须原样保留上一版条目的所有字段，一字不改地照抄，不允许新增/删除/修改。
  · 禁止基于逻辑推理、默认进程、或"应该发生了"而主动修改这些表的状态。
- 各表生命周期（新增/更新/删除时机）互不相同、不共用一套标准，严格按各表小节内的规则执行，不要把某张表的清理逻辑套用到另一张表上。
- **【增量维护，不是重写】**：下方会提供"已有表格数据"。你的工作是在它的基础上做**修改与追加**，
  不是推倒重来。除非某表的规则明确要求删除某行，否则**已有的每一行都必须原样保留在输出里**
  （包括其所有字段内容），只对确实发生变化的字段做修改，并把新出现的内容追加为新行。
  场景表、物品轨迹表、核心待办事项表、日程表尤其如此——它们的价值就在于跨轮次累积，
  每次重写会导致历史信息丢失。输出时必须包含全部保留行 + 修改行 + 新增行的完整表格。
- 所有带编号的标签字段，输出时必须整体带上反引号，例如 \`[Scene_1]\`、\`[Item_Anchor_1]\`、\`[Chapter_1]\`、\`[Foreshadow_1]\`。
- 若故事本身没有明确章节划分，请自行以连续递增的编号维护一套 \`[Chapter_X]\` 标签体系，保持前后一致、不重新编号已分配过的章节。`;

    // 按当前启用的表格动态拼装完整的系统提示词
    function buildOffscreenSystemPrompt() {
        const s = settings();
        const tables = getOffscreenTables({ onlyEnabled: true });
        const specs = tables.map((t) => {
            const cols = t.columns.map((c) => c.label).join(' | ');
            return `## ${t.title}\n列结构：${cols}\n${t.spec || ''}`.trim();
        }).join('\n\n');
        const schema = '{' + tables.map((t) => {
            const obj = t.columns.map((c) => `"${c.field}":""`).join(',');
            return `"${t.jsonKey}":[{${obj}}]`;
        }).join(',') + '}';
        return [
            s.prompts.offscreenPreamble || DEFAULT_OFFSCREEN_PREAMBLE,
            '维护规则如下：\n' + specs,
            '请仅输出一个 JSON 对象，不要输出任何 Markdown 代码块围栏或解释文字，结构必须是：\n' + schema,
            '所有表都需要在已有数据基础上按各自规则更新（新增/修改/按规则删除），而不是每次推倒重写；未被规则要求变更的表格或行，请原样保留上一版数据。',
        ].join('\n\n');
    }

    function buildOffscreenUserPrompt(extras) {
        const parts = [];
        if (extras.history) parts.push(`【最近聊天记录】\n${extras.history}`);
        if (extras.worldInfo) parts.push(`【世界书参考】\n${extras.worldInfo}`);
        if (extras.charBook) parts.push(`【角色卡内嵌世界书参考】\n${extras.charBook}`);
        const off = chatData().offscreen;
        const tables = getOffscreenTables({ onlyEnabled: true });
        const existing = {};
        let hasExisting = false;
        for (const t of tables) {
            const rows = off.tables?.[t.key] || [];
            existing[t.jsonKey] = rows;
            if (rows.length) hasExisting = true;
        }
        if (hasExisting) {
            parts.push(`【已有表格数据 —— 这是上一轮的完整结果，请在此基础上增量维护】\n${JSON.stringify(existing)}\n\n处理要求：以上每一行都要原样出现在你的输出里（除非该表规则明确要求删除它），只修改确实变化了的字段，并追加新增行。禁止只输出新增部分，禁止重写或精简已有行。`);
        }
        parts.push(hasExisting
            ? '请结合当前故事所处的时间点（季节/月份/星期/节日，从聊天记录与世界书中推断）与最新正文内容，在已有表格基础上做增量更新，输出包含全部保留行的完整表格。'
            : '请结合当前故事所处的时间点（季节/月份/星期/节日，从聊天记录与世界书中推断）与最新正文内容生成以上表格。');
        return parts.join('\n\n');
    }

    // ------------------------------------------------------------------
    // 剧情推演：生成一张"网状事件矩阵"，每个事件是宏观剧情篇章而非单个回合，
    // 事件之间按用户的最终抉择跳转（分支明确指向某个事件编号）。
    // 正文里事件结束时会带一个隐藏标记，扩展扫描到后自动把未走的分支置灰并推进。
    // ------------------------------------------------------------------
    const PLOT_MARKER_RE = /<!--\s*EGO_PLOT\s*:\s*([A-Za-z0-9_]+)\s*:\s*([A-Za-z])\s*-->/i;
    const PLOT_MARKER_RE_G = /<!--\s*EGO_PLOT\s*:\s*([A-Za-z0-9_]+)\s*:\s*([A-Za-z])\s*-->/gi;

    // 每个发展方向不只是一个标签，还带一段写进提示词的具体约束：
    // 明确"可以写什么"与"不可以写什么"，避免模型自由发散跑偏。
    function defaultPlotDirections() {
        return [
            { id: 'he', name: 'HE', enabled: false, prompt:
`整体走向为 Happy Ending（圆满结局）。
可以写：矛盾被正面解决、误会被澄清、关系最终确立或修复；角色为彼此做出实质让步与改变；遗留问题在结局前被逐一收束。
不可以写：为了圆满而强行洗白已经确立的恶意行为或伤害；凭空出现未经铺垫的贵人、资源或转机来解决困境；让角色性格突变以迁就好结局。` },
            { id: 'be', name: 'BE', enabled: false, prompt:
`整体走向为 Bad Ending（悲剧结局）。
可以写：误会层层累积无法挽回、时机永远错过、代价已经付出无法收回、清醒地选择分开。悲剧必须有明确的因果链。
不可以写：为虐而虐、没有因果铺垫的突发不幸；让角色做出完全违背既定人设的自毁行为；用意外死亡草率收尾。` },
            { id: 'gouxue', name: '狗血', enabled: false, prompt:
`走强戏剧巧合路线。
可以写：身世秘密被揭穿、关键对话被第三人撞见、旧情人回归、隐瞒的过去曝光、误会在最坏的时机爆发、身份错位。
不可以写：穿越/重生/超自然等改变世界规则的设定（除非世界书里已经确立）；失忆症突然痊愈这类医学奇迹；一个巧合叠另一个巧合到失去可信度。` },
            { id: 'nuexin', name: '虐心', enabled: false, prompt:
`走情感痛感路线。
可以写：求而不得、隐忍与克制、自我牺牲、迟来的真相、明知结果仍选择靠近。痛感来自处境与选择，不是来自伤害本身。
不可以写：生理性酷刑、血腥或自残的具体描写；把死亡当成唯一的情绪手段；无意义地反复重复同一种伤害。` },
            { id: 'richang', name: '日常', enabled: false, prompt:
`走生活质感路线，但仍必须是"事件"而不是"事情"。
可以写：由生活摩擦升级成的真实冲突——因为一顿饭的一句话彻底吵翻、因为一次接送迟到暴露了长期的忽视、因为一件旧物被丢弃引发的清算。
不可以写：单纯的日程流水账（吃饭、上班、睡觉本身不是事件）；突然的凶案、绑架、车祸等脱离生活质感的强情节。` },
            { id: 'gongdou', name: '宫斗', enabled: false, prompt:
`走后宫/内宅权力斗争路线。
可以写：位分与恩宠的争夺、构陷与自证、结盟与背叛、规矩与人情的冲突、借刀杀人、母族牵连。
不可以写：现代科技、现代法律或平等观念；脱离世界书已确立的时代背景与等级制度；直接的武力火并解决问题。` },
            { id: 'shangzhan', name: '商战', enabled: false, prompt:
`走商业博弈路线。
可以写：股权争夺、并购与反收购、合同陷阱、商业机密泄露、舆论战、董事会表决、资金链危机。
不可以写：编造具体的财务数字、股价、法条并当作既定事实；用黑帮火并式暴力解决商业问题；主角凭一次演讲就翻盘。` },
            { id: 'haomen', name: '豪门', enabled: false, prompt:
`走豪门家族路线。
可以写：继承权之争、联姻施压、长辈干涉、门第差距造成的羞辱与自尊冲突、家族丑闻、私生子与遗产。
不可以写：无来由的巨额财富凭空出现或蒸发；把财富当成解决一切矛盾的万能钥匙；脱离世界书已确立的家族结构。` },
            { id: 'lizhi', name: '励志', enabled: false, prompt:
`走成长路线。
可以写：目标受挫后的重建、具体可验证的能力成长节点、被否定后的自证、必须付出的取舍代价。
不可以写：一夜成功；靠奇遇或贵人直接跳过努力过程；用空洞的口号代替具体行动。` },
        ];
    }

    const DEFAULT_PLOT_SYSTEM_PROMPT = `你是一个为角色扮演故事设计"网状剧情矩阵"的编剧引擎。

【事件的绝对定义：宏观篇章，不是微观回合】
- 一个【事件】是一个宏观剧情篇章（例如：遭遇家族激烈催婚、两人流落荒岛求生、公司股权被恶意收购），
  绝对不是用户的一次单句对话或一个单一动作。
- 反例对照：单纯"吃饭"不是事件；"因为吃饭时的一句话彻底吵翻"、"吃饭时弄丢了关键物品"才是事件。
  判断标准是：它是否制造了持续的戏剧张力与需要多轮互动才能收束的冲突。
- 一个事件在其【终局分支】条件被彻底触发前，剧情应当锁死在该事件内部，允许并鼓励几十个回合的
  沟通、试探、争执与反应。绝不可把一次普通抗议或一句台词误判为事件结束。

【设计内核】
1. 事件的本质是"情感与关系的炼金炉"，必须具备强戏剧性与冲突性：逼迫角色面临两难抉择、
   打破原有社交边界、暴露隐藏的软肋、面临考验、催生极端情绪或引发立场反转。
   每个事件都应是对当前情感状态的一次定向爆破。
2. 网状而非线性：事件之间基于用户的最终抉择交织跳转（可以从事件01直接跃迁到事件04），
   最终汇聚到多个不同结局。
3. 电报体精简表述：只写核心与触发条件，绝不写过程，避免冗余。
4. 严禁结构坍塌：每一个事件都必须写全分支，且每条分支都必须明确指向一个具体的事件编号，
   绝对禁止在后半段偷工减料省略分支。

【关于"结局"的规则（务必严格执行）】
- 本次生成的是故事的**一个阶段**，不是整个故事的完结。
- 每条分支线最终都必须收束到一个**阶段性开放结局**节点，绝不允许出现走不完、绕不出去的死循环。
- "阶段性开放结局"的写法：该分支的 next 填 "OPEN"，并在 condition 里写清这一阶段收束在什么状态上。
  它应当给人"一个段落告一段落，但两人的故事仍在继续"的感觉——留有余韵与新的悬念，
  而不是"从此幸福/一切结束"式的彻底封盘。
- 禁止悬空指向：每条分支的 next 只能是三种之一：
  (a) 本次矩阵中**确实存在**的事件编号；
  (b) "OPEN"（阶段性开放结局）；
  (c) "END"（整个故事的最终结局）——仅在【发展方向】里明确出现 HE 或 BE 时才允许使用。
  绝对不允许指向一个本次没有生成的编号，那会让剧情走进死路。
- 允许事件之间回环跳转（如事件05的某分支回到事件02），但必须保证**从任何一个事件出发，
  沿着任意分支走下去，都能在有限步内抵达 OPEN 或 END**，不能存在只在几个事件间无限打转的闭环。

【分支条件的写法（极其重要，写错会导致剧情永远卡住）】
- 这是 AI 角色扮演，不是让用户点选项。**绝对不要把分支条件写成某个具体动作**
  （如"若用户当众下跪道歉""若用户砸碎了那只杯子"）——用户很可能永远不会做那个特定动作，
  剧情就会永远卡在这个事件里出不去。
- 分支条件必须落在**用户的情绪与情感倾向**上，判定依据是用户言行中透出的态度，而不是某个指定行为。
- 一个事件的两条分支必须是**情感方向相反**的一组，并且要**穷尽式覆盖**：
  任何一种用户反应都应该能被归入其中一边，不留中间地带。
- 正确示范：
  · 分支A：若用户表现出**靠近与接纳**的情感倾向——软化、心疼、妥协、想要挽留、愿意共担（无论以何种方式表达）
  · 分支B：若用户表现出**疏离与抗拒**的情感倾向——冷淡、防备、愤怒、划清界限、选择自保（无论以何种方式表达）
- 错误示范（禁止这样写）：
  · ✗ "若用户答应了求婚" ✗ "若用户在三天内回到老宅" ✗ "若用户交出那份文件"
- 每条分支都要写清是"哪一类情感倾向"，并加上"无论以何种方式表达"之类的兜底措辞，
  让判定看的是情感基调而非具体动作。

【输出格式】
只输出一个 JSON 对象，不要输出任何 Markdown 代码块围栏或解释文字，结构必须是：
{"events":[{"id":"01","title":"事件代号","core":"戏剧核心：本事件旨在催生/改变的情感张力",
"trigger":"导火索(起)：如何在正文中自然触发","branches":[
{"key":"A","condition":"若用户表现出XX类情感倾向（无论以何种方式表达）","next":"02"},
{"key":"B","condition":"若用户表现出与之相反的XX类情感倾向（无论以何种方式表达）","next":"03"}]}]}
id 使用两位数字字符串（"01"、"02"…）。每个事件至少 2 条分支。
next 只能填：本次矩阵中确实存在的事件 id、"OPEN"（阶段性开放结局）、或 "END"（仅在指定 HE/BE 时可用）。`;

    const DEFAULT_PLOT_INJECT_TEMPLATE = `[剧情推演·当前事件（隐藏指令，绝不可在正文中直接复述或提及本段存在）]
当前所处事件：{{event_title}}
戏剧核心：{{event_core}}
导火索：{{event_trigger}}
终局分支：
{{branches}}

运行法则：
- 本事件是一个宏观篇章，需要经历多轮互动才能收束。在用户的行为真正满足下面某条终局分支条件之前，
  请持续在本事件内部深化细节、对话与拉扯，不要急于推进，按当前对话的自然速率行进。
- 分支判定看的是**用户言行透出的情感倾向**（靠近/疏离、软化/强硬等），不是某个具体动作；
  只要情感基调明确落向某一边，即可判定该分支成立，不要死等某个特定行为发生。
- 每次回复前在后台比对用户输入：若判定其情感倾向真正满足了某条终局分支条件，则在本次正文的末尾
  以自然叙事手法无痕引入下一事件的导火索，并在正文最末尾追加一行隐藏标记：
  {{marker_example}}
  其中最后一个字母替换为实际触发的分支字母。该标记是 HTML 注释，不会显示给用户，请务必原样输出。
- 若未满足任何分支条件，则不要输出该标记，继续在当前事件中推进。`;

    function plotDirections() {
        const s = settings();
        return (s.plot.directions || []).filter((d) => d.enabled).map((d) => d.name);
    }

    function buildPlotUserPrompt(extras) {
        const s = settings();
        const parts = [];
        const active = (s.plot.directions || []).filter((d) => d.enabled);
        const dirs = active.map((d) => d.name);
        if (active.length) {
            const detail = active
                .map((d) => `〔${d.name}〕\n${(d.prompt || '').trim() || '（未填写具体约束）'}`)
                .join('\n\n');
            parts.push(`【发展方向】${dirs.join('、')}\n以下是每个方向的具体写作约束，必须严格遵守其中的"可以写/不可以写"：\n\n${detail}`);
            const hasEnding = active.some((d) => /^(he|be)$/i.test(d.name.trim()));
            parts.push(hasEnding
                ? '【结局许可】本次已指定 HE/BE，除了阶段性开放结局（next="OPEN"）外，也允许生成整个故事的最终结局节点（next="END"）。'
                : '【结局许可】本次未指定 HE 或 BE，禁止使用 "END"。所有线路最终都收束到阶段性开放结局（next="OPEN"），给人"这一段落告一段落、故事仍在继续"的感觉。');
        } else {
            parts.push('【发展方向】（未指定，请根据现有剧情自行判断合适的走向）');
            parts.push('【结局许可】未指定 HE 或 BE，禁止使用 "END"。所有线路最终都收束到阶段性开放结局（next="OPEN"）。');
        }
        parts.push('【通用约束】所有事件必须基于正文与世界书中已经确立的人物、场所、关系推导，禁止凭空引入未出现过的重要角色或设定，禁止改变世界规则。');
        const custom = String(s.plot.customEvents || '').trim();
        if (custom) {
            parts.push(`【用户指定的必含事件（最高优先级）】\n${custom}\n\n处理要求：以上每一条都**必须**作为独立事件出现在本次矩阵中，不得省略、不得合并、不得改写其核心诉求；\n可以为它们补充戏剧核心、导火索与分支条件，并安排合理的先后顺序与跳转关系。\n若这些事件数量不足要求的节点总数，由你补全其余事件；若已超过，则以用户指定的为准全部保留。`);
        }
        parts.push(`【要求生成的事件节点数量】至少 ${s.plot.minEvents} 个`);
        if (extras.history) parts.push(`【最近聊天记录】\n${extras.history}`);
        if (extras.worldInfo) parts.push(`【世界书参考】\n${extras.worldInfo}`);
        if (extras.charBook) parts.push(`【角色卡内嵌世界书参考】\n${extras.charBook}`);
        const pl = chatData().plot;
        if (s.plot.sendCurrent && pl.events?.length) {
            const cur = pl.currentId ? getPlotEvent(pl.currentId) : null;
            const walked = pl.path.map((x) => `事件${x.eventId}→分支${x.branchKey}`).join('，') || '（尚未走过任何分支）';
            parts.push(`【已有事件矩阵】\n${JSON.stringify({ events: pl.events, path: pl.path })}`);
            parts.push(`【当前进度】已走过的路径：${walked}\n当前正处于：${cur ? `[事件${cur.id}] ${cur.title}` : '（上一阶段已收束于开放结局，尚未进入新事件）'}`);
            parts.push(cur
                ? `【续写要求】请以「当前正处于的事件」作为新矩阵的**第一个事件**（编号重新从 "01" 开始，内容沿用它的核心与导火索，可按最新剧情微调），然后从它往后续写全新的后续事件与分支。\n已经走过的旧事件不要再重复生成，只作为背景理解。`
                : `【续写要求】上一阶段已收束，请从当前剧情状态出发，生成新一阶段的事件矩阵（编号重新从 "01" 开始），承接已走过的路径，不要重复旧事件。`);
        } else {
            if (pl.events?.length) log('debug', 'system', '已有推演未随本次请求发送（设置里「生成时发送当前推演」为关）——本次将重新生成一份全新矩阵。');
            parts.push('【重写要求】请无视此前可能存在的任何推演，基于当前剧情重新生成一份全新的网状事件矩阵。');
        }
        return parts.join('\n\n');
    }

    function normalizePlotEvents(rows) {
        const out = [];
        rows.forEach((r, i) => {
            if (!r || typeof r !== 'object') return;
            const id = String(r.id ?? r.编号 ?? r.事件编号 ?? String(i + 1).padStart(2, '0')).trim();
            const branchesRaw = Array.isArray(r.branches) ? r.branches : (Array.isArray(r.终局分支) ? r.终局分支 : []);
            const branches = branchesRaw.map((b, bi) => ({
                key: String(b?.key ?? b?.分支 ?? String.fromCharCode(65 + bi)).trim().toUpperCase().slice(0, 1),
                condition: String(b?.condition ?? b?.条件 ?? b?.触发条件 ?? '').trim(),
                next: String(b?.next ?? b?.指向 ?? b?.下一事件 ?? '').trim(),
            })).filter((b) => b.key);
            out.push({
                id,
                title: String(r.title ?? r.标题 ?? r.事件代号 ?? r.代号 ?? `事件${id}`).trim(),
                core: String(r.core ?? r.戏剧核心 ?? r.核心 ?? '').trim(),
                trigger: String(r.trigger ?? r.导火索 ?? r.起 ?? '').trim(),
                branches,
            });
        });
        return out;
    }

    /**
     * 校验事件矩阵：
     *  1) 悬空指向——分支 next 指向了不存在的编号（模型最常犯的错，会让剧情走进死路）
     *  2) 死循环——从某事件出发沿任意分支走都回不到 OPEN/END
     * 悬空指向会被自动修正为 OPEN（阶段性开放结局），并写进日志。
     */
    function validateAndRepairPlot(events) {
        const ids = new Set(events.map((e) => e.id));
        const issues = { dangling: [], deadloop: [] };

        for (const ev of events) {
            for (const b of ev.branches) {
                const nx = String(b.next || '').trim();
                const up = nx.toUpperCase();
                if (up === 'OPEN' || up === 'END') { b.next = up; continue; }
                if (!nx || !ids.has(nx)) {
                    issues.dangling.push(`事件${ev.id}/分支${b.key} → "${nx || '(空)'}"`);
                    b.next = 'OPEN'; // 悬空一律收束为阶段性开放结局，避免走进死路
                }
            }
        }

        // 可达性：能在有限步内走到 OPEN/END 的事件集合
        const canTerminate = new Set();
        let changed = true;
        while (changed) {
            changed = false;
            for (const ev of events) {
                if (canTerminate.has(ev.id)) continue;
                const ok = ev.branches.some((b) => {
                    const up = String(b.next).toUpperCase();
                    return up === 'OPEN' || up === 'END' || canTerminate.has(b.next);
                });
                if (ok) { canTerminate.add(ev.id); changed = true; }
            }
        }
        for (const ev of events) {
            if (!canTerminate.has(ev.id)) issues.deadloop.push(ev.id);
        }
        return issues;
    }

    async function generatePlot() {
        const s = settings();
        log('info', 'system', `开始生成剧情推演矩阵（方向：${plotDirections().join('、') || '未指定'}）`);
        const extras = await gatherExtras({ historyDepth: s.plot.historyDepth });
        const userPrompt = buildPlotUserPrompt(extras);
        const raw = await callModel(s.prompts.plotSystemPrompt, userPrompt, '剧情推演');
        const parsed = tryParseJsonRobust(raw, '剧情推演');
        if (!parsed) throw new Error('未能从模型响应中解析出 JSON，剧情矩阵未更新。请在「日志」标签页查看完整响应。');
        const rows = Array.isArray(parsed.events) ? parsed.events : (Array.isArray(parsed) ? parsed : null);
        if (!rows) throw new Error('响应 JSON 里没有找到 events 数组。');
        const events = normalizePlotEvents(rows);
        if (!events.length) throw new Error('解析出的事件列表为空。');

        const issues = validateAndRepairPlot(events);
        if (issues.dangling.length) {
            log('warn', 'parse',
                `模型生成了 ${issues.dangling.length} 条指向不存在事件的悬空分支，已自动改为"阶段性开放结局(OPEN)"，避免剧情走进死路。`,
                issues.dangling);
        }
        if (issues.deadloop.length) {
            log('warn', 'parse',
                `这些事件沿任意分支走下去都无法抵达开放结局，可能形成死循环：${issues.deadloop.join('、')}。建议重新生成一次。`,
                issues.deadloop);
            toast(`推演里有 ${issues.deadloop.length} 个事件可能形成死循环，详见日志`, 'warning');
        }
        const cd = chatData();
        cd.plot.events = events;
        if (!cd.plot.currentId || !events.some((e) => e.id === cd.plot.currentId)) {
            cd.plot.currentId = events[0].id;
        }
        cd.plot.updatedAt = Date.now();
        saveChatData();
        log('info', 'system', `剧情推演生成完成：${events.length} 个事件节点，当前节点 ${cd.plot.currentId}`);
        updateInjections();
        return events;
    }

    function getPlotEvent(id) {
        return chatData().plot.events.find((e) => e.id === id);
    }

    // 扫描正文里的隐藏标记：事件结束 + 走了哪条分支
    function scanPlotMarker(mesText) {
        const cd = chatData();
        const pl = cd.plot;
        if (!pl.events.length) return false;
        let matched = null;
        let m;
        PLOT_MARKER_RE_G.lastIndex = 0;
        while ((m = PLOT_MARKER_RE_G.exec(String(mesText || '')))) matched = m; // 取最后一个
        if (!matched) return false;
        const eventId = matched[1];
        const branchKey = matched[2].toUpperCase();
        const ev = getPlotEvent(eventId);
        if (!ev) {
            log('warn', 'trigger', `正文里出现剧情标记，但事件 ${eventId} 不在当前矩阵中，已忽略`, matched[0]);
            return false;
        }
        const taken = ev.branches.find((b) => b.key === branchKey);
        if (!taken) {
            log('warn', 'trigger', `事件 ${eventId} 没有分支 ${branchKey}，已忽略`, ev.branches.map((b) => b.key));
            return false;
        }
        // 未走的分支置灰
        pl.deadBranches[eventId] = ev.branches.filter((b) => b.key !== branchKey).map((b) => b.key);
        pl.path.push({ eventId, branchKey, at: Date.now() });
        const next = String(taken.next || '').trim();
        const up = next.toUpperCase();
        if (up === 'OPEN') {
            pl.currentId = '';
            log('info', 'trigger', `剧情推进：事件 ${eventId} 经分支 ${branchKey} 收束到「阶段性开放结局」。可在设置里打开「生成时发送当前推演」再点生成，从这里往后续写下一阶段。`);
            toast('本阶段已收束于开放结局，可生成下一阶段推演', 'info');
        } else if (up === 'END') {
            pl.currentId = '';
            log('info', 'trigger', `剧情推进：事件 ${eventId} 经分支 ${branchKey} 抵达故事最终结局（END）。`);
        } else if (next && getPlotEvent(next)) {
            pl.currentId = next;
            log('info', 'trigger', `剧情推进：事件 ${eventId} 经分支 ${branchKey} 结束 → 进入事件 ${next}；分支 ${pl.deadBranches[eventId].join('/')} 已置灰`);
        } else {
            pl.currentId = '';
            log('warn', 'trigger', `事件 ${eventId} 的分支 ${branchKey} 指向了不存在的 "${next}"，已按开放结局处理。`);
        }
        saveChatData();
        updateInjections();
        return true;
    }

    function buildPlotInjectionText() {
        const s = settings();
        const pl = chatData().plot;
        if (!pl.currentId) return '';
        const ev = getPlotEvent(pl.currentId);
        if (!ev) return '';
        const branches = ev.branches
            .map((b) => `  分支${b.key}：${b.condition || '（条件未写明）'} → 指向 ${b.next || '未指定'}`)
            .join('\n');
        const markerExample = `<!--EGO_PLOT:${ev.id}:A-->`;
        return String(s.prompts.plotInjectTemplate || DEFAULT_PLOT_INJECT_TEMPLATE)
            .replace(/\{\{event_id\}\}/g, ev.id)
            .replace(/\{\{event_title\}\}/g, `[事件${ev.id}] ${ev.title}`)
            .replace(/\{\{event_core\}\}/g, ev.core || '—')
            .replace(/\{\{event_trigger\}\}/g, ev.trigger || '—')
            .replace(/\{\{branches\}\}/g, branches)
            .replace(/\{\{marker_example\}\}/g, markerExample);
    }

    // ------------------------------------------------------------------
    // 上下文素材收集
    // ------------------------------------------------------------------
    function gatherHistory(n) {
        if (!n || n <= 0) return '';
        const c = ctx();
        const chat = c.chat || [];
        return chat.slice(-n)
            .map((m) => `${m.name}：${String(m.mes || '').slice(0, 2000)}`)
            .join('\n');
    }

    // 获取当前"已绑定/已激活"的世界书清单：全局勾选激活的世界书（读取酒馆世界书面板的
    // 多选框 #world_info，因为该激活列表未通过 getContext() 暴露）、当前角色绑定的主世界书、
    // 当前聊天绑定的聊天书。三者取并集去重。
    // 角色卡内嵌世界书（character_book）不是一本独立的世界书文件，
    // loadWorldInfo 读不到它，所以在条目管理里用这个虚拟书名单独归组，
    // 让它的每个条目也能像普通世界书条目一样被逐条开关。
    const CHAR_BOOK_KEY = '__character_book__';
    const CHAR_BOOK_LABEL = '角色卡内嵌世界书';

    // 取出角色卡内嵌世界书的条目，统一成 {uid,label,content,disabledInST} 结构
    function getCharBookEntries() {
        const c = ctx();
        const book = c.characters?.[c.characterId]?.data?.character_book;
        if (!book?.entries?.length) return [];
        return book.entries.map((e, i) => ({
            uid: String(e.id ?? e.uid ?? i),
            label: e.comment || (Array.isArray(e.keys) ? e.keys.join('，') : '') || `条目#${i + 1}`,
            content: e.content || '',
            // V2 角色卡规范用 enabled=false 表示禁用，部分卡沿用世界书的 disable=true
            disabledInST: e.enabled === false || e.disable === true,
        }));
    }

    function getBoundWorldInfoBookNames() {
        const c = ctx();
        const names = new Set();
        try {
            const globalActive = $('#world_info').val();
            if (Array.isArray(globalActive)) globalActive.forEach((n) => n && names.add(n));
        } catch (e) { /* 面板可能尚未渲染，忽略 */ }
        const chatBook = c.chatMetadata?.world_info;
        if (chatBook) names.add(chatBook);
        const char = c.characters?.[c.characterId];
        const charBook = char?.data?.extensions?.world;
        if (charBook) names.add(charBook);
        return [...names].filter(Boolean);
    }

    // ------------------------------------------------------------------
    // 统一收集所有可用的世界书条目，并按内容去重。
    // 关键背景：酒馆导入角色卡时，importEmbeddedWorldInfo() 会把卡里的
    // data.character_book 转存成一本独立世界书文件，并通过 data.extensions.world
    // 绑定回角色——但卡里原来的 character_book 不会被清除。于是同一批内容会同时
    // 存在于"独立世界书"和"卡内嵌书"两处。若两处都收，就会重复发送、浪费 token。
    // 因此这里以独立世界书为准，卡内嵌书中内容已出现过的条目直接跳过。
    // ------------------------------------------------------------------
    // 某条目是否要发送：优先用用户在「世界书」标签页里的手动覆盖，
    // 没有覆盖时跟随该条目在酒馆/角色卡里的启用状态。
    function isWorldInfoEntrySendEnabled(s, bookName, uidStr, disabledInST) {
        const key = `${bookName}::${uidStr}`;
        const override = s.worldInfoOverrides[key];
        return override !== undefined ? override : !disabledInST;
    }

    function normContentKey(str) {
        return String(str || '').replace(/\s+/g, '').trim();
    }

    async function collectAllLoreEntries() {
        const c = ctx();
        const out = [];
        const seen = new Set();

        for (const bookName of getBoundWorldInfoBookNames()) {
            try {
                const book = await c.loadWorldInfo(bookName);
                const entries = book?.entries ? Object.values(book.entries) : [];
                for (const e of entries) {
                    const content = e.content || '';
                    out.push({
                        source: 'world',
                        book: bookName,
                        uid: String(e.uid),
                        label: e.comment || (Array.isArray(e.key) ? e.key.join('，') : '') || `条目#${e.uid}`,
                        content,
                        disabledInST: !!e.disable,
                    });
                    if (content.trim()) seen.add(normContentKey(content));
                }
            } catch (err) {
                log('warn', 'system', `读取世界书「${bookName}」失败：${err.message || err}`, err);
            }
        }

        const embedded = getCharBookEntries();
        const uniqueEmbedded = embedded.filter((e) => !e.content.trim() || !seen.has(normContentKey(e.content)));
        const dupCount = embedded.length - uniqueEmbedded.length;
        if (dupCount > 0) {
            log('debug', 'system',
                `角色卡内嵌世界书有 ${dupCount}/${embedded.length} 条与已绑定的独立世界书内容重复，已自动去重（酒馆导入角色卡时会把内嵌书转存为独立世界书，但卡里仍保留一份副本）。`);
        }
        for (const e of uniqueEmbedded) {
            out.push({ source: 'charbook', book: CHAR_BOOK_KEY, uid: e.uid, label: e.label, content: e.content, disabledInST: e.disabledInST });
        }
        return out;
    }

    // 管理列表用（设置页「世界书」标签页）
    async function fetchWorldInfoEntriesForManagement() {
        return collectAllLoreEntries();
    }

    async function gatherWorldInfo() {
        const s = settings();
        const all = await collectAllLoreEntries();
        return buildLoreText(all.filter((e) => e.source === 'world'), s, '世界书/聊天书');
    }

    async function gatherCharBook() {
        const s = settings();
        const all = await collectAllLoreEntries();
        return buildLoreText(all.filter((e) => e.source === 'charbook'), s, '角色卡内嵌世界书');
    }

    function buildLoreText(entries, s, labelForLog) {
        const sent = [];
        const skipped = [];
        let text = '';
        for (const e of entries) {
            if (!isWorldInfoEntrySendEnabled(s, e.book, e.uid, e.disabledInST)) {
                skipped.push(e.label);
                continue;
            }
            sent.push(e.label);
            const bookLabel = e.book === CHAR_BOOK_KEY ? CHAR_BOOK_LABEL : e.book;
            text += `【${bookLabel} - ${e.label}】\n${e.content}\n\n`;
        }
        if (entries.length) {
            log('debug', 'system', `${labelForLog} 条目筛选：发送 ${sent.length} 条，跳过 ${skipped.length} 条`, { 已发送: sent, 已跳过: skipped });
        }
        return text.trim();
    }

    async function gatherExtras({ historyDepth } = {}) {
        const s = settings();
        const extras = { history: '', worldInfo: '', charBook: '' };
        extras.history = gatherHistory(historyDepth === undefined ? s.historyDepth : historyDepth);
        if (s.includeWorldInfo) extras.worldInfo = await gatherWorldInfo();
        if (s.includeCharBook) extras.charBook = await gatherCharBook();
        return extras;
    }

    // ------------------------------------------------------------------
    // 模型调用（跟随酒馆当前 API，或使用独立 API）
    // ------------------------------------------------------------------
    async function callModel(systemPrompt, userPrompt, label = '') {
        const s = settings();
        log('info', 'request', `[${label}] 发起请求（模式：${s.api.mode === 'custom' ? '独立API' : '跟随酒馆'}）`, {
            systemPrompt,
            userPrompt,
        });
        let raw;
        try {
            if (s.api.mode === 'custom' && s.api.url) {
                raw = await callCustomApi(systemPrompt, userPrompt);
            } else {
                // 跟随酒馆当前正文所用的 API/连接配置，走原生 generateRaw（不经过 WI/AN 自动扫描，
                // 上下文素材由本扩展自行拼接到 userPrompt 中）。
                const c = ctx();
                const result = await c.generateRaw({ prompt: userPrompt, systemPrompt });
                raw = typeof result === 'string' ? result : String(result ?? '');
            }
        } catch (err) {
            log('error', 'request', `[${label}] 请求失败：${err.message || err}`, err);
            throw err;
        }
        log('info', 'response', `[${label}] 收到响应（长度 ${raw.length} 字符）`, raw);
        if (!raw || !raw.trim()) {
            log('warn', 'response', `[${label}] 响应为空字符串，请检查所选 API/连接配置是否可用`);
        }
        return raw;
    }

    async function callCustomApi(systemPrompt, userPrompt) {
        const s = settings();
        const base = s.api.url.replace(/\/+$/, '');
        const headers = { 'Content-Type': 'application/json' };
        if (s.api.key) headers['Authorization'] = `Bearer ${s.api.key}`;
        const body = JSON.stringify({
            model: s.api.model || undefined,
            messages: [
                ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
                { role: 'user', content: userPrompt },
            ],
            stream: false,
        });
        log('debug', 'request', `独立 API 请求：POST ${base}/chat/completions`, { model: s.api.model, hasKey: !!s.api.key });
        const res = await fetch(`${base}/chat/completions`, { method: 'POST', headers, body });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(`独立 API 请求失败：HTTP ${res.status} ${res.statusText} ${text.slice(0, 300)}`);
        }
        const data = await res.json();
        log('debug', 'response', '独立 API 原始返回', data);
        return data?.choices?.[0]?.message?.content ?? '';
    }

    async function fetchCustomModelList() {
        const s = settings();
        const base = s.api.url.replace(/\/+$/, '');
        const headers = {};
        if (s.api.key) headers['Authorization'] = `Bearer ${s.api.key}`;
        const res = await fetch(`${base}/models`, { headers });
        if (!res.ok) throw new Error(`拉取模型列表失败：HTTP ${res.status}`);
        const data = await res.json();
        const list = Array.isArray(data?.data) ? data.data.map((m) => m.id).filter(Boolean) : [];
        s.api.modelList = list;
        saveSettings();
        return list;
    }

    function stripCodeFence(text) {
        let t = String(text || '').trim();
        // 去掉最外层的 Markdown 代码块围栏（不要求围栏必须在字符串的最开头/最结尾，
        // 因为部分模型会在代码块前后附带说明文字）。
        const fenceMatch = t.match(/```(?:json|html)?\s*([\s\S]*?)```/i);
        if (fenceMatch) return fenceMatch[1].trim();
        // 没有闭合围栏（比如被截断）时，至少去掉开头的围栏标记
        t = t.replace(/^```(?:json|html)?\s*/i, '');
        return t.trim();
    }

    /**
     * 尽量从模型的自由格式回复中解析出 JSON 对象，每一步都写日志，方便排查
     * “模型返回了什么、我们是怎么解析失败的”。
     */
    function tryParseJsonRobust(raw, label = '') {
        const attempts = [];

        // 尝试 1：直接解析原始文本
        attempts.push({ name: '直接 JSON.parse(原始文本)', text: raw });
        // 尝试 2：去除 Markdown 代码块围栏后解析
        const fenced = stripCodeFence(raw);
        if (fenced !== raw) attempts.push({ name: '去除代码块围栏后解析', text: fenced });
        // 尝试 3：截取第一个 { 到最后一个 } 之间的内容
        const braceMatch = raw.match(/\{[\s\S]*\}/);
        if (braceMatch) attempts.push({ name: '截取花括号包裹的最大片段', text: braceMatch[0] });
        // 尝试 4：在去围栏文本里再截取花括号片段
        if (fenced !== raw) {
            const braceMatch2 = fenced.match(/\{[\s\S]*\}/);
            if (braceMatch2) attempts.push({ name: '去围栏 + 截取花括号片段', text: braceMatch2[0] });
        }

        for (const attempt of attempts) {
            try {
                const parsed = JSON.parse(attempt.text);
                log('info', 'parse', `[${label}] JSON 解析成功，使用方式：${attempt.name}`);
                return parsed;
            } catch (err) {
                log('debug', 'parse', `[${label}] 解析尝试失败（${attempt.name}）：${err.message}`);
            }
        }
        log('error', 'parse', `[${label}] 所有解析方式均失败，模型可能没有按要求返回 JSON。原始响应已记录在上方 response 日志中，可对照检查模型是否输出了额外说明文字、Markdown 表格等非 JSON 内容。`);
        return null;
    }

    // ------------------------------------------------------------------
    // 生成：组件
    // ------------------------------------------------------------------
    async function generateWidget(widget) {
        log('info', 'system', `开始生成组件「${widget.name}」`, { id: widget.id, prompt: widget.prompt });
        const extras = await gatherExtras();
        const userPrompt = buildWidgetUserPrompt(widget, extras);
        const raw = await callModel(settings().prompts.widgetSystemPrompt, userPrompt, `组件:${widget.name}`);
        const html = stripCodeFence(raw);
        const cd = chatData();
        cd.widgetResults[widget.id] = { html, updatedAt: Date.now() };
        saveChatData();
        log('info', 'system', `组件「${widget.name}」生成完成，已写入 chatMetadata.${MODULE_NAME}.widgetResults["${widget.id}"]`);
        return html;
    }

    async function generateAllWidgets({ onProgress } = {}) {
        const s = settings();
        const enabled = s.widgets.filter((w) => w.enabled);
        for (const w of enabled) {
            onProgress?.(w, 'start');
            try {
                await generateWidget(w);
                onProgress?.(w, 'done');
            } catch (err) {
                console.error('[Ego] 组件生成失败', w.name, err);
                const cd = chatData();
                cd.widgetResults[w.id] = { html: `<p style="color:#c33;font-family:sans-serif;padding:10px;">生成失败：${escapeHtml(err.message || String(err))}</p>`, updatedAt: Date.now(), error: true };
                saveChatData();
                onProgress?.(w, 'error', err);
            }
        }
        updateInjections();
    }

    // ------------------------------------------------------------------
    // 生成：镜头之外
    // ------------------------------------------------------------------
    async function generateOffscreen({ onProgress } = {}) {
        log('info', 'system', '开始生成/更新「表格生成」内容');
        onProgress?.('offscreen', 'start');
        const sOff = settings().offscreen;
        const depth = sOff.followWidgets ? settings().historyDepth : sOff.historyDepth;
        const extras = await gatherExtras({ historyDepth: depth });
        const userPrompt = buildOffscreenUserPrompt(extras);
        try {
            const raw = await callModel(buildOffscreenSystemPrompt(), userPrompt, '表格生成');
            const parsed = tryParseJsonRobust(raw, '表格生成');
            if (!parsed) {
                throw new Error('未能从模型响应中解析出 JSON，表格因此没有更新。请在「日志」标签页查看完整响应内容。');
            }
            if (typeof parsed !== 'object' || Array.isArray(parsed)) {
                throw new Error(`解析出的内容不是预期的对象结构（实际类型：${Array.isArray(parsed) ? 'array' : typeof parsed}）`);
            }
            const cd = chatData();
            cd.offscreen.tables = cd.offscreen.tables || {};
            const changed = [];
            for (const t of getOffscreenTables({ onlyEnabled: true })) {
                const rows = parsed[t.jsonKey];
                if (Array.isArray(rows)) {
                    cd.offscreen.tables[t.key] = normalizeRowsGeneric(rows, t.columns, t.title);
                    changed.push(`${t.title}(${cd.offscreen.tables[t.key].length}行)`);
                } else {
                    log('warn', 'parse', `响应中没有合法的 ${t.jsonKey} 数组（${t.title}未更新，保留旧数据）`, parsed);
                }
            }
            cd.offscreen.updatedAt = Date.now();
            saveChatData();
            log('info', 'system', `「表格生成」更新完成：${changed.join('、') || '（无表被更新，请检查上面的 parse 警告）'}`);
            onProgress?.('offscreen', 'done');
        } catch (err) {
            log('error', 'system', `「表格生成」生成失败：${err.message || err}`, err);
            onProgress?.('offscreen', 'error', err);
            throw err;
        }
        updateInjections();
    }

    // ------------------------------------------------------------------
    // 后台任务管理：生成流程必须独立于界面存活。
    // 之前 UI 直接 await 生成流程，弹窗一关、DOM 被移除后 finally 里的
    // 界面操作会连带影响流程感知，用户看起来就是"关掉界面就不生成了"。
    // 现在统一走这里：任务挂在模块级变量上，与弹窗生命周期完全解耦，
    // 关闭界面照常跑完，并在开始/结束时用 toast 通知。
    // ------------------------------------------------------------------
    const bgTask = { running: false, label: '', startedAt: 0, promise: null };

    function isGenerating() {
        return bgTask.running;
    }

    /**
     * 启动一个后台生成任务。不会被 UI await，弹窗关闭也会继续执行。
     * @param {string} label 任务名称，用于提示与日志
     * @param {() => Promise<any>} fn 实际执行的异步函数
     */
    function startBackgroundTask(label, fn) {
        if (bgTask.running) {
            toast(`「${bgTask.label}」正在生成中，请等它结束后再开始新任务`, 'warning');
            return bgTask.promise;
        }
        bgTask.running = true;
        bgTask.label = label;
        bgTask.startedAt = Date.now();
        log('info', 'system', `▶ 后台任务开始：${label}（关闭界面不会中断）`);
        toast(`开始生成：${label}（可关闭窗口，后台继续）`, 'info');
        refreshGeneratingIndicator();

        bgTask.promise = (async () => {
            try {
                await fn();
                const secs = ((Date.now() - bgTask.startedAt) / 1000).toFixed(1);
                log('info', 'system', `■ 后台任务完成：${label}，耗时 ${secs}s`);
                toast(`生成完成：${label}（耗时 ${secs}s）`, 'success');
            } catch (err) {
                log('error', 'system', `■ 后台任务失败：${label} — ${err.message || err}`, err);
                toast(`生成失败：${label} — ${err.message || err}，详见日志`, 'error');
            } finally {
                bgTask.running = false;
                bgTask.label = '';
                bgTask.promise = null;
                refreshGeneratingIndicator();
                // 任务结束后如果界面还开着，刷新一下结果显示
                refreshOpenPanels();
            }
        })();
        return bgTask.promise;
    }

    // 在弹窗标题栏显示"生成中"状态，并禁用生成按钮
    function refreshGeneratingIndicator() {
        if (!$modal) return;
        const $ind = $modal.find('#ow_generating_indicator');
        if (bgTask.running) {
            $ind.html(`<i class="fa-solid fa-spinner ow-spin"></i> ${escapeHtml(bgTask.label)}`).show();
        } else {
            $ind.hide().empty();
        }
        $modal.find('.ow-gen-btn').prop('disabled', bgTask.running);
    }

    async function runGenerationPipeline(onProgress) {
        log('info', 'system', '=== 开始批量生成流程 ===');
        await generateAllWidgets({ onProgress });
        const s = settings();
        if (s.offscreen.enabled && s.offscreen.followWidgets) {
            try {
                await generateOffscreen({ onProgress });
            } catch (e) {
                log('warn', 'system', `表格生成失败：${e.message || e}`);
            }
        } else if (!s.offscreen.enabled) {
            log('info', 'system', '表格功能未启用，本次跳过。');
        } else {
            log('info', 'system', '表格设置为“不跟随组件”，本次不随组件生成（按自身楼层间隔独立触发）。');
        }
        log('info', 'system', '=== 批量生成流程结束 ===');
    }

    // ------------------------------------------------------------------
    // 自动触发：检测新回复中是否出现完整闭合的 <content>...</content>
    // ------------------------------------------------------------------
    function messageHasClosedContentTag(mes) {
        return /<content>[\s\S]*?<\/content>/i.test(String(mes || ''));
    }

    async function onCharacterMessageRendered(messageId) {
        const s = settings();

        // 剧情推演标记扫描：与手动/自动模式无关，只要正文里出现标记就推进
        try {
            const c0 = ctx();
            const mes0 = c0.chat?.[messageId];
            if (mes0 && !mes0.is_user && !mes0.is_system && scanPlotMarker(mes0.mes)) {
                toast('剧情已推进到下一个事件', 'info');
                if ($modal) renderPlotPanel($modal.find('.ow-panel[data-panel="plot"]'));
            }
        } catch (err) {
            log('error', 'trigger', `剧情标记扫描出错：${err.message || err}`, err);
        }

        if (s.triggerMode !== 'auto') {
            log('debug', 'trigger', `收到 CHARACTER_MESSAGE_RENDERED（消息#${messageId}），但当前为手动模式，跳过`);
            return;
        }
        const c = ctx();
        const mes = c.chat?.[messageId];
        if (!mes || mes.is_user || mes.is_system) {
            log('debug', 'trigger', `消息#${messageId} 不是角色回复（is_user/is_system），跳过`);
            return;
        }

        const cd = chatData();
        const at = cd.autoTriggerState;
        const currentFloor = c.chat.length; // 以当前聊天总消息条数作为"楼层数"
        let ranFullPipeline = false;

        // 触发方式一：检测正文闭合标签（命中则组件与表格一起触发，行为与之前一致）
        if (s.autoTriggers.onContentTag) {
            const matched = messageHasClosedContentTag(mes.mes);
            log(matched ? 'info' : 'debug', 'trigger',
                `[标签触发] 消息#${messageId}（当前楼层${currentFloor}）<content> 标签检测：${matched ? '匹配成功，准备自动生成' : '未匹配到闭合标签'}`,
                { mesPreview: String(mes.mes || '').slice(0, 500) });
            if (matched) {
                toast('检测到新正文，正在后台生成…', 'info');
                try {
                    await runGenerationPipeline();
                    ranFullPipeline = true;
                    at.lastWidgetFloor = currentFloor;
                    at.lastOffscreenFloor = currentFloor;
                    saveChatData();
                    toast('自动生成流程结束（详情见日志标签页）', 'success');
                    refreshOpenPanels();
                } catch (err) {
                    log('error', 'trigger', '[标签触发] 自动生成流程抛出未捕获异常', err);
                    toast('组件生成出现错误，详见日志标签页', 'error');
                }
            }
        }

        // 触发方式二/三：按楼层数独立触发（标签触发已经跑过完整流程时，本轮不再重复触发，
        // 并顺带把楼层计数对齐到当前楼层，避免紧接着又立刻因楼层到量而重复生成一次）
        if (!ranFullPipeline) {
            if (s.autoTriggers.widgetsByFloor?.enabled) {
                const interval = Math.max(1, Number(s.autoTriggers.widgetsByFloor.interval) || 1);
                const delta = currentFloor - (at.lastWidgetFloor || 0);
                log('debug', 'trigger', `[组件楼层触发] 当前楼层${currentFloor}，距上次生成已过${delta}层，间隔设置${interval}层`);
                if (delta >= interval) {
                    log('info', 'trigger', `[组件楼层触发] 达到间隔，自动生成组件`);
                    try {
                        await generateAllWidgets();
                        at.lastWidgetFloor = currentFloor;
                        saveChatData();
                        refreshOpenPanels();
                    } catch (err) {
                        log('error', 'trigger', '[组件楼层触发] 生成失败', err);
                        toast('按楼层自动生成组件时出错，详见日志标签页', 'error');
                    }
                }
            }
            if (s.offscreen.enabled && !s.offscreen.followWidgets && s.autoTriggers.offscreenByFloor?.enabled) {
                const interval2 = Math.max(1, Number(s.autoTriggers.offscreenByFloor.interval) || 1);
                const delta2 = currentFloor - (at.lastOffscreenFloor || 0);
                log('debug', 'trigger', `[表格楼层触发] 当前楼层${currentFloor}，距上次生成已过${delta2}层，间隔设置${interval2}层`);
                if (delta2 >= interval2) {
                    log('info', 'trigger', `[表格楼层触发] 达到间隔，自动生成表格`);
                    try {
                        await generateOffscreen();
                        at.lastOffscreenFloor = currentFloor;
                        saveChatData();
                        refreshOpenPanels();
                    } catch (err) {
                        log('error', 'trigger', '[表格楼层触发] 生成失败', err);
                        toast('按楼层自动生成表格时出错，详见日志标签页', 'error');
                    }
                }
            }
        }
    }

    // ------------------------------------------------------------------
    // 正文注入
    // ------------------------------------------------------------------
    function positionKeyToEnum(key) {
        return PROMPT_TYPES[key] ?? PROMPT_TYPES.IN_CHAT;
    }

    function updateInjections() {
        const c = ctx();
        const s = settings();
        log('debug', 'inject', `更新正文注入（组件注入:${s.injectWidgets ? '开' : '关'}，表格注入:${s.offscreen.enabled && s.offscreen.injectTables ? '开' : '关'}）`);
        // 组件注入
        if (s.injectWidgets) {
            const cd = chatData();
            const enabled = s.widgets.filter((w) => w.enabled);
            const text = enabled
                .map((w) => cd.widgetResults[w.id]?.html)
                .filter(Boolean)
                .join('\n\n');
            if (text) {
                c.setExtensionPrompt(INJECT_KEY_WIDGETS, `[以下是与当前场景相关的附加参考素材，不要在正文中直接复述或提及其存在：\n${text}]`, positionKeyToEnum(s.injectPosition), Number(s.injectDepth) || 0);
            } else {
                c.setExtensionPrompt(INJECT_KEY_WIDGETS, '', PROMPT_TYPES.IN_PROMPT, 0);
            }
        } else {
            c.setExtensionPrompt(INJECT_KEY_WIDGETS, '', PROMPT_TYPES.IN_PROMPT, 0);
        }

        // 表格注入
        if (s.offscreen.enabled && s.offscreen.injectTables) {
            const cd = chatData();
            const text = renderOffscreenAsPlainText(cd.offscreen);
            if (text) {
                c.setExtensionPrompt(INJECT_KEY_OFFSCREEN, `[表格参考信息，仅用于保持世界的连贯性，不要直接照搬描述：\n${text}]`, positionKeyToEnum(s.offscreen.injectPosition), Number(s.offscreen.injectDepth) || 0);
            } else {
                c.setExtensionPrompt(INJECT_KEY_OFFSCREEN, '', PROMPT_TYPES.IN_PROMPT, 0);
            }
        } else {
            c.setExtensionPrompt(INJECT_KEY_OFFSCREEN, '', PROMPT_TYPES.IN_PROMPT, 0);
        }

        // 剧情推演注入
        if (s.plot.injectEnabled) {
            const text = buildPlotInjectionText();
            if (text) {
                c.setExtensionPrompt(INJECT_KEY_PLOT, text, positionKeyToEnum(s.plot.injectPosition), Number(s.plot.injectDepth) || 0);
            } else {
                c.setExtensionPrompt(INJECT_KEY_PLOT, '', PROMPT_TYPES.IN_PROMPT, 0);
            }
        } else {
            c.setExtensionPrompt(INJECT_KEY_PLOT, '', PROMPT_TYPES.IN_PROMPT, 0);
        }
    }

    function renderOffscreenAsPlainText(off) {
        const parts = [];
        for (const t of getOffscreenTables({ onlyEnabled: true })) {
            const rows = off.tables?.[t.key] || [];
            if (!rows.length) continue;
            const body = rows.map((r) => '- ' + t.columns.map((c) => `${c.label}:${r[c.field] || '—'}`).join('｜')).join('\n');
            parts.push(`${t.title}：\n${body}`);
        }
        return parts.join('\n\n');
    }

    // ------------------------------------------------------------------
    // 预设条目浏览（Chat Completion / OpenAI 兼容预设）
    // ------------------------------------------------------------------
    function getPresetNames() {
        try {
            const pm = ctx().getPresetManager('openai');
            return pm ? pm.getAllPresets() : [];
        } catch (e) {
            return [];
        }
    }

    function getPresetEntries(name) {
        try {
            const pm = ctx().getPresetManager('openai');
            const preset = pm?.getCompletionPresetByName(name);
            const prompts = preset?.prompts;
            if (!Array.isArray(prompts)) return [];
            return prompts
                .filter((p) => p && (p.content || '').trim().length > 0)
                .map((p) => ({ identifier: p.identifier, name: p.name || p.identifier, content: p.content }));
        } catch (e) {
            console.warn('[Ego] 读取预设条目失败', e);
            return [];
        }
    }

    // ------------------------------------------------------------------
    // 小工具：toast 提示
    // ------------------------------------------------------------------
    function toast(msg, type = 'info') {
        try {
            if (window.toastr && typeof window.toastr[type] === 'function') {
                window.toastr[type](msg, EXT_NAME);
                return;
            }
        } catch (e) { /* ignore */ }
        console.log(`[Ego] ${msg}`);
    }

    // ------------------------------------------------------------------
    // 收藏夹：把某次生成的组件结果快照存进全局设置，跨聊天可查看。
    // 每条记录日期、角色名、用户名，便于日后回溯是哪个场景下生成的。
    // ------------------------------------------------------------------
    function favs() {
        const s = settings();
        if (!s.favorites) s.favorites = { folders: [], items: [] };
        if (!Array.isArray(s.favorites.folders)) s.favorites.folders = [];
        if (!Array.isArray(s.favorites.items)) s.favorites.items = [];
        if (!s.favorites.folders.length) {
            s.favorites.folders.push({ id: 'default', name: '默认收藏夹', createdAt: Date.now() });
        }
        return s.favorites;
    }

    function currentNames() {
        const c = ctx();
        const charName = c.characters?.[c.characterId]?.name || c.name2 || '未知角色';
        const userName = c.name1 || '用户';
        return { charName, userName };
    }

    function addFavorite(widget, folderId) {
        const f = favs();
        const cd = chatData();
        const result = cd.widgetResults[widget.id];
        if (!result?.html) { toast('这个组件还没有生成结果，无法收藏', 'warning'); return null; }
        const { charName, userName } = currentNames();
        const item = {
            id: `fav_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
            folderId: folderId || f.folders[0].id,
            widgetId: widget.id,
            widgetName: widget.name || '未命名组件',
            html: result.html,
            savedAt: Date.now(),
            charName,
            userName,
        };
        f.items.push(item);
        saveSettings();
        log('info', 'system', `已收藏组件「${item.widgetName}」到「${f.folders.find((x) => x.id === item.folderId)?.name || '收藏夹'}」`);
        return item;
    }

    function isFavorited(widgetId) {
        const cd = chatData();
        const html = cd.widgetResults[widgetId]?.html;
        if (!html) return false;
        return favs().items.some((it) => it.widgetId === widgetId && it.html === html);
    }

    // 选择收藏到哪个文件夹的小弹窗
    function openFavoriteDialog(widget) {
        const f = favs();
        const $ov = $(`
        <div class="ow-sub-overlay">
          <div class="ow-sub-modal" style="height:auto;max-height:70vh;width:min(460px,92vw);">
            <div class="ow-modal-header">
              <div class="ow-modal-title">收藏「${escapeHtml(widget.name || '未命名组件')}」</div>
              <div class="ow-close-btn ow-sub-close"><i class="fa-solid fa-xmark"></i></div>
            </div>
            <div class="ow-sub-body">
              <div class="ow-field-label">选择收藏夹</div>
              <select class="ow-select" id="ow_fav_folder" style="width:100%;">
                ${f.folders.map((fo) => `<option value="${escapeHtml(fo.id)}">${escapeHtml(fo.name)}</option>`).join('')}
              </select>
              <div class="ow-row" style="margin-top:10px;">
                <input type="text" class="ow-input ow-grow" id="ow_fav_new_folder" placeholder="或新建收藏夹，输入名称">
                <button class="ow-btn" id="ow_fav_create">新建</button>
              </div>
              <div class="ow-row" style="margin-top:14px;justify-content:flex-end;">
                <button class="ow-btn" id="ow_fav_cancel">取消</button>
                <button class="ow-btn ow-primary" id="ow_fav_confirm">收藏</button>
              </div>
            </div>
          </div>
        </div>`).appendTo(document.documentElement);

        const close = () => $ov.remove();
        $ov.on('click', (e) => { if ($(e.target).hasClass('ow-sub-overlay')) close(); });
        $ov.find('.ow-sub-close, #ow_fav_cancel').on('click', close);
        $ov.find('#ow_fav_create').on('click', function () {
            const name = String($ov.find('#ow_fav_new_folder').val() || '').trim();
            if (!name) { toast('请输入收藏夹名称', 'warning'); return; }
            const fo = { id: `folder_${Date.now().toString(36)}`, name, createdAt: Date.now() };
            f.folders.push(fo);
            saveSettings();
            $ov.find('#ow_fav_folder').append(`<option value="${escapeHtml(fo.id)}" selected>${escapeHtml(fo.name)}</option>`);
            $ov.find('#ow_fav_new_folder').val('');
        });
        $ov.find('#ow_fav_confirm').on('click', function () {
            const folderId = $ov.find('#ow_fav_folder').val();
            const item = addFavorite(widget, folderId);
            if (item) toast(`已收藏到「${f.folders.find((x) => x.id === folderId)?.name}」`, 'success');
            close();
            if ($modal) renderFavoritesPanel($modal.find('.ow-panel[data-panel="favorites"]'));
        });
    }

    // ---------------- 收藏夹面板 ----------------
    function renderFavoritesPanel($panel) {
        const f = favs();
        bindPreviewAutoResize();
        $panel.html(`
        <div class="ow-panel-bar">
          <div class="ow-row" style="margin:0;">
            <span class="ow-muted">${f.items.length} 个收藏 · ${f.folders.length} 个文件夹</span>
          </div>
          <button class="ow-btn" id="ow_fav_add_folder"><i class="fa-solid fa-folder-plus"></i> 新建文件夹</button>
        </div>
        <div id="ow_fav_folders"></div>`);

        const $wrap = $panel.find('#ow_fav_folders');
        if (!f.items.length) {
            $wrap.html('<div class="ow-empty">还没有收藏。在「组件生成」里点组件右上角的 ☆ 收藏按钮即可保存。</div>');
        } else {
            let html = '';
            for (const fo of f.folders) {
                const items = f.items.filter((it) => it.folderId === fo.id).sort((a, b) => b.savedAt - a.savedAt);
                html += `
                <div class="ow-widget-card ow-collapsed" data-folder="${escapeHtml(fo.id)}">
                  <div class="ow-widget-card-head">
                    <span class="ow-caret" data-action="fav-toggle"><i class="fa-solid fa-chevron-right"></i></span>
                    <i class="fa-solid fa-folder" style="opacity:.6;"></i>
                    <span class="ow-widget-name" data-action="fav-toggle">${escapeHtml(fo.name)}</span>
                    <span class="ow-muted ow-widget-meta">${items.length} 项</span>
                    <span class="ow-spacer"></span>
                    <button class="ow-btn" data-action="fav-rename" title="重命名"><i class="fa-solid fa-pen"></i></button>
                    <button class="ow-btn ow-danger" data-action="fav-del-folder" title="删除文件夹"><i class="fa-solid fa-trash"></i></button>
                  </div>
                  <div class="ow-widget-card-body">
                    ${items.length ? items.map((it) => `
                      <div class="ow-fav-item" data-fav="${escapeHtml(it.id)}">
                        <div class="ow-fav-meta">
                          <span class="ow-fav-name">${escapeHtml(it.widgetName)}</span>
                          <span class="ow-fav-tags">
                            <span class="ow-chip">${new Date(it.savedAt).toLocaleDateString()} ${new Date(it.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            <span class="ow-chip"><i class="fa-solid fa-masks-theater"></i> ${escapeHtml(it.charName)}</span>
                            <span class="ow-chip"><i class="fa-solid fa-user"></i> ${escapeHtml(it.userName)}</span>
                          </span>
                          <span class="ow-spacer"></span>
                          <button class="ow-btn" data-action="fav-view" title="查看"><i class="fa-solid fa-eye"></i></button>
                          <button class="ow-btn" data-action="fav-move" title="移动到其他文件夹"><i class="fa-solid fa-folder-tree"></i></button>
                          <button class="ow-btn ow-danger" data-action="fav-del" title="删除"><i class="fa-solid fa-trash"></i></button>
                        </div>
                        <div class="ow-fav-preview" style="display:none;"></div>
                      </div>`).join('') : '<div class="ow-muted" style="padding:6px 2px;">这个文件夹还是空的</div>'}
                  </div>
                </div>`;
            }
            $wrap.html(html);
        }

        $panel.find('#ow_fav_add_folder').on('click', function () {
            const name = prompt('新文件夹名称：', '新收藏夹');
            if (!name) return;
            f.folders.push({ id: `folder_${Date.now().toString(36)}`, name, createdAt: Date.now() });
            saveSettings();
            renderFavoritesPanel($panel);
        });

        $wrap.on('click', '[data-action="fav-toggle"]', function () {
            const $card = $(this).closest('.ow-widget-card');
            $card.toggleClass('ow-collapsed');
            const expanded = !$card.hasClass('ow-collapsed');
            $card.find('.ow-caret i').first().attr('class', expanded ? 'fa-solid fa-chevron-down' : 'fa-solid fa-chevron-right');
        });

        $wrap.on('click', '[data-action="fav-rename"]', function () {
            const id = $(this).closest('.ow-widget-card').data('folder');
            const fo = f.folders.find((x) => x.id === id);
            if (!fo) return;
            const name = prompt('重命名文件夹：', fo.name);
            if (!name) return;
            fo.name = name;
            saveSettings();
            renderFavoritesPanel($panel);
        });

        $wrap.on('click', '[data-action="fav-del-folder"]', function () {
            const id = $(this).closest('.ow-widget-card').data('folder');
            const fo = f.folders.find((x) => x.id === id);
            const count = f.items.filter((it) => it.folderId === id).length;
            if (!fo || !confirm(`删除文件夹「${fo.name}」？其中的 ${count} 个收藏也会一并删除。`)) return;
            f.folders = f.folders.filter((x) => x.id !== id);
            f.items = f.items.filter((it) => it.folderId !== id);
            saveSettings();
            renderFavoritesPanel($panel);
        });

        $wrap.on('click', '[data-action="fav-view"]', function () {
            const $item = $(this).closest('.ow-fav-item');
            const it = f.items.find((x) => x.id === $item.data('fav'));
            if (!it) return;
            const $pv = $item.find('.ow-fav-preview');
            if ($pv.is(':visible')) { $pv.hide().empty(); return; }
            const frameId = `fav_${it.id}`;
            $pv.html(`
              <div class="ow-result-frame-wrap" style="margin:8px 0 4px;">
                <div class="ow-result-head">
                  <span>${escapeHtml(it.widgetName)}</span>
                  <span><button class="ow-btn" data-action="fav-fullscreen"><i class="fa-solid fa-expand"></i></button></span>
                </div>
                <iframe class="ow-result-frame" data-frame-id="${frameId}" sandbox="allow-scripts" allowfullscreen
                  srcdoc="${escapeHtml(buildPreviewSrcdoc(it.html, frameId))}"></iframe>
              </div>`).show();
        });

        $wrap.on('click', '[data-action="fav-fullscreen"]', function () {
            const el = $(this).closest('.ow-result-frame-wrap').find('iframe')[0];
            if (!el) return;
            const req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
            if (req) req.call(el).catch((err) => toast(`无法进入全屏：${err.message || err}`, 'warning'));
        });

        $wrap.on('click', '[data-action="fav-move"]', function () {
            const $item = $(this).closest('.ow-fav-item');
            const it = f.items.find((x) => x.id === $item.data('fav'));
            if (!it) return;
            const names = f.folders.map((fo, i) => `${i + 1}. ${fo.name}`).join('\n');
            const pick = prompt(`移动到哪个文件夹？输入序号：\n${names}`, '1');
            const idx = Number(pick) - 1;
            if (!(idx >= 0 && idx < f.folders.length)) return;
            it.folderId = f.folders[idx].id;
            saveSettings();
            renderFavoritesPanel($panel);
        });

        $wrap.on('click', '[data-action="fav-del"]', function () {
            const $item = $(this).closest('.ow-fav-item');
            const it = f.items.find((x) => x.id === $item.data('fav'));
            if (!it || !confirm(`删除收藏「${it.widgetName}」？`)) return;
            f.items = f.items.filter((x) => x.id !== it.id);
            saveSettings();
            renderFavoritesPanel($panel);
        });
    }

    // ------------------------------------------------------------------
    // UI：主弹窗
    // ------------------------------------------------------------------
    let $modal = null;

    function openModal() {
        if ($modal) { $modal.remove(); $modal = null; }
        // 关掉酒馆的"魔法棒"菜单：它是 z-index 29999 的不透明面板，
        // 窄屏时会铺满视口挡住我们的弹窗。
        try {
            const $menu = $('#extensionsMenu');
            if ($menu.length && $menu.is(':visible')) $menu.hide();
        } catch (e) { /* 忽略 */ }
        const html = `
        <div class="ow-modal-overlay" id="ow_modal_overlay">
          <div class="ow-modal">
            <div class="ow-modal-header">
              <div class="ow-modal-title">🧠 Ego 小助手
                <span id="ow_generating_indicator" class="ow-generating" style="display:none;"></span>
              </div>
              <div class="ow-close-btn" id="ow_close_btn"><i class="fa-solid fa-xmark"></i></div>
            </div>
            <div class="ow-tabs">
              <div class="ow-tab active" data-tab="widgets">组件生成</div>
              <div class="ow-tab" data-tab="offscreen">表格生成</div>
              <div class="ow-tab" data-tab="plot">剧情推演</div>
              <div class="ow-tab" data-tab="favorites">收藏夹</div>
              <div class="ow-tab" data-tab="worldinfo">世界书</div>
              <div class="ow-tab" data-tab="prompts">提示词</div>
              <div class="ow-tab" data-tab="settings">设置</div>
              <div class="ow-tab" data-tab="log">日志<span class="ow-log-badge" id="ow_log_badge" style="display:none;"></span></div>
            </div>
            <div class="ow-panel active" data-panel="widgets"></div>
            <div class="ow-panel" data-panel="offscreen"></div>
            <div class="ow-panel" data-panel="plot"></div>
            <div class="ow-panel" data-panel="favorites"></div>
            <div class="ow-panel" data-panel="worldinfo"></div>
            <div class="ow-panel" data-panel="prompts"></div>
            <div class="ow-panel" data-panel="settings"></div>
            <div class="ow-panel" data-panel="log"></div>
          </div>
        </div>`;
        // 挂到 <html> 而不是 <body>：窄屏时酒馆会给 body 加
        // position:fixed + overflow:hidden（mobile-styles.css，≤1000px），
        // 挂在 body 下容易被其盒模型/裁剪影响。同时用内联 !important 强制几何，
        // 避免任何外部样式把弹窗挤出视口。
        $modal = $(html).appendTo(document.documentElement);
        forceOverlayGeometry($modal);

        $modal.on('click', (e) => { if (e.target.id === 'ow_modal_overlay') closeModal(); });
        $modal.find('#ow_close_btn').on('click', closeModal);
        $modal.find('.ow-tab').on('click', function () {
            const tab = $(this).data('tab');
            $modal.find('.ow-tab').removeClass('active');
            $(this).addClass('active');
            $modal.find('.ow-panel').removeClass('active');
            $modal.find(`.ow-panel[data-panel="${tab}"]`).addClass('active');
            // 窄屏时被点中的标签可能只露出一半，滚动让它完整可见
            try { this.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' }); } catch (e) { /* 忽略 */ }
        });

        // 标签栏滑到最右端时去掉右侧渐隐
        const $tabs = $modal.find('.ow-tabs');
        const syncTabsFade = () => {
            const el = $tabs[0];
            if (!el) return;
            const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 2;
            $tabs.toggleClass('ow-tabs-end', atEnd);
        };
        $tabs.on('scroll', syncTabsFade);
        setTimeout(syncTabsFade, 80);

        applyTheme();
        // 每个面板单独 try/catch：任何一个面板出错都不能连累后面的面板变成空白
        // （曾经因为一个 ReferenceError，导致它之后的四个标签页全是空的）
        const panels = [
            ['widgets', renderWidgetsPanel],
            ['offscreen', renderOffscreenPanel],
            ['plot', renderPlotPanel],
            ['favorites', renderFavoritesPanel],
            ['worldinfo', renderWorldInfoPanel],
            ['prompts', renderPromptsPanel],
            ['settings', renderSettingsPanel],
        ];
        for (const [name, fn] of panels) {
            const $p = $modal.find(`.ow-panel[data-panel="${name}"]`);
            try {
                fn($p);
            } catch (err) {
                log('error', 'ui', `渲染「${name}」面板失败：${err.message || err}`, err);
                $p.html(`<div class="ow-empty">这个面板渲染出错了：<br><code>${escapeHtml(String(err.message || err))}</code><br>
                    <span class="ow-muted">其他面板不受影响。详细堆栈见「日志」标签页。</span></div>`);
            }
        }
        $logPanel = $modal.find('.ow-panel[data-panel="log"]');
        renderLogEntries($logPanel);
        refreshGeneratingIndicator();
        log('info', 'ui', '主界面已打开');
        // 打开后量一次实际几何，写进日志。若窗口在视口外或尺寸为 0，这里会直接暴露出来。
        setTimeout(() => {
            let info = null;
            try { info = diagnoseModalGeometry(); } catch (e) { log('warn', 'ui', `几何诊断失败（不影响使用）：${e.message || e}`); }
            try {
                const r = $modal && $modal.find('.ow-modal')[0]?.getBoundingClientRect();
                if (r && (r.width < 50 || r.height < 50 || r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth)) {
                    log('error', 'ui', '⚠ 弹窗被渲染到视口之外或尺寸异常，已尝试强制复位。若仍看不到界面，请把上面这条几何诊断日志发给开发者。', info);
                    forceOverlayGeometry($modal);
                }
            } catch (e) { /* 忽略 */ }
        }, 60);

        // 每次打开都重新检查一次更新（有缓存也无妨，请求很轻量），完成后刷新横幅/设置页状态/菜单角标
        checkExtensionUpdate().then(() => {
            if (!$modal) return;
            renderUpdateBanner($modal);
            const $panel = $modal.find('.ow-panel[data-panel="settings"]');
            if ($panel.find('#ow_update_status').length) renderUpdateSection($panel);
        });
    }

    /**
     * 用内联 !important 强制遮罩层的定位与尺寸。
     * 窄屏下酒馆会改写 body 的定位/溢出，某些主题也可能带全局规则，
     * 这里不依赖外部 CSS，直接把几何钉死在视口上。
     */
    function forceOverlayGeometry($root) {
        const el = $root && $root[0];
        if (!el) return;
        const css = [
            ['position', 'fixed'], ['top', '0px'], ['left', '0px'],
            ['right', '0px'], ['bottom', '0px'],
            ['width', '100vw'], ['height', '100vh'],
            ['max-width', 'none'], ['max-height', 'none'],
            ['margin', '0'], ['transform', 'none'], ['zoom', '1'],
            ['display', 'flex'], ['visibility', 'visible'], ['opacity', '1'],
            ['z-index', '30050'],
        ];
        for (const [k, v] of css) el.style.setProperty(k, v, 'important');
        // 支持 dvh 的浏览器用 dvh，避免移动端地址栏收放导致高度不对
        if (window.CSS?.supports?.('height', '100dvh')) {
            el.style.setProperty('height', '100dvh', 'important');
        }
    }

    /** 诊断：报告弹窗实际的位置与尺寸，排查"点了但看不见"这类问题 */
    function diagnoseModalGeometry() {
        if (!$modal) { log('warn', 'ui', '诊断：当前没有打开的弹窗'); return null; }
        // 诊断本身绝不能抛错影响主流程
        const gcs = (el) => {
            try { return (window.getComputedStyle || globalThis.getComputedStyle)?.(el) || {}; }
            catch (e) { return {}; }
        };
        const rect = (el) => {
            try { const r = el.getBoundingClientRect(); return { top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height), bottom: Math.round(r.bottom), right: Math.round(r.right) }; }
            catch (e) { return '读取失败'; }
        };
        const ov = $modal[0];
        const md = $modal.find('.ow-modal')[0];
        const info = {
            视口: `${window.innerWidth} x ${window.innerHeight}`,
            遮罩层位置: ov ? rect(ov) : '无',
            弹窗位置: md ? rect(md) : '无',
            遮罩层计算样式: ov ? (() => {
                const c = gcs(ov);
                return { position: c.position, display: c.display, visibility: c.visibility, opacity: c.opacity, zIndex: c.zIndex, overflow: c.overflow };
            })() : '无',
            弹窗计算样式: md ? (() => {
                const c = gcs(md);
                return { width: c.width, height: c.height, display: c.display, visibility: c.visibility, opacity: c.opacity, transform: c.transform };
            })() : '无',
            body样式: (() => {
                const c = gcs(document.body);
                return { position: c.position, overflow: c.overflow, transform: c.transform, filter: c.filter, width: c.width, height: c.height };
            })(),
            挂载父节点: ov?.parentElement?.tagName || '未知',
        };
        log('info', 'ui', '弹窗几何诊断（若界面显示不出来，请把这条日志发给开发者）', info);
        return info;
    }

    function closeModal() {
        $modal?.remove();
        $modal = null;
        $logPanel = null;
    }

    function refreshOpenPanels() {
        if (!$modal) return;
        renderWidgetsPanel($modal.find('.ow-panel[data-panel="widgets"]'));
        renderOffscreenPanel($modal.find('.ow-panel[data-panel="offscreen"]'));
        renderPlotPanel($modal.find('.ow-panel[data-panel="plot"]'));
    }

    // ---------------- 日志面板 ----------------
    function renderLogPanelShell($panel) {
        $panel.html(`
        <div class="ow-row">
          <button class="ow-btn" id="ow_log_copy"><i class="fa-regular fa-copy"></i> 复制全部日志</button>
          <button class="ow-btn ow-danger" id="ow_log_clear"><i class="fa-solid fa-broom"></i> 清空日志</button>
          <span class="ow-muted">仅存于本次会话内存，刷新即清空。</span>
        </div>
        <div id="ow_log_entries"></div>`);
        $panel.find('#ow_log_copy').on('click', async () => {
            const text = exportLogsText() || '（暂无日志）';
            try {
                await navigator.clipboard.writeText(text);
                toast('日志已复制到剪贴板', 'success');
            } catch (e) {
                // 剪贴板 API 不可用时，退化为弹窗展示可手动复制
                const w = window.open('', '_blank');
                if (w) w.document.write(`<pre style="white-space:pre-wrap;word-break:break-all;">${escapeHtml(text)}</pre>`);
            }
        });
        $panel.find('#ow_log_clear').on('click', () => {
            if (confirm('确定清空全部日志吗？')) clearLogs();
        });
    }

    function renderLogEntries($panel) {
        if (!$panel || !$panel.length) return;
        if (!$panel.find('#ow_log_entries').length) renderLogPanelShell($panel);
        const $entries = $panel.find('#ow_log_entries');
        const levelColor = { error: '#f66', warn: '#e6b800', info: 'inherit', debug: '#888' };
        if (!logs.length) {
            $entries.html('<div class="ow-empty">暂无日志，进行一次生成操作后这里会显示详细过程。</div>');
            return;
        }
        const wasAtBottom = $entries.length && Math.abs($entries[0].scrollHeight - $entries.scrollTop() - $entries.outerHeight()) < 40;
        $entries.html(logs.slice().reverse().map((e) => {
            const t = new Date(e.time).toLocaleTimeString();
            const color = levelColor[e.level] || 'inherit';
            return `<div class="ow-log-entry" style="border-left:3px solid ${color};padding:4px 8px;margin-bottom:4px;font-size:0.82em;">
                <div style="opacity:0.7;">${t} · <b style="color:${color};">${e.level.toUpperCase()}</b> · ${escapeHtml(e.tag)}</div>
                <div>${escapeHtml(e.msg)}</div>
                ${e.data ? `<pre style="white-space:pre-wrap;word-break:break-all;max-height:220px;overflow:auto;background:rgba(255,255,255,0.04);padding:6px;border-radius:4px;margin-top:4px;">${escapeHtml(e.data)}</pre>` : ''}
            </div>`;
        }).join(''));
    }

    function applyTheme() {
        if (!$modal) return;
        $modal.find('#ow_custom_theme_style').remove();
        const s = settings();
        if (s.theme.mode === 'custom' && s.theme.customCss) {
            $modal.append(`<style id="ow_custom_theme_style">${s.theme.customCss}</style>`);
        }
    }

    // ---------------- 组件生成面板：模块一「组件显示」+ 模块二「组件列表」 ----------------
    function renderWidgetsPanel($panel) {
        const s = settings();
        $panel.html(`
        <div class="ow-panel-bar">
          <div class="ow-row" style="margin:0;">
            <button class="ow-btn ow-primary ow-gen-btn" id="ow_generate_now"><i class="fa-solid fa-wand-magic-sparkles"></i> 生成全部组件</button>
            <span class="ow-muted">${s.triggerMode === 'auto' ? '自动模式' : '手动模式'}</span>
          </div>
          <button class="ow-btn" id="ow_widget_list_btn"><i class="fa-solid fa-list"></i> 组件列表</button>
        </div>
        <div id="ow_widget_results"></div>`);

        renderWidgetResults($panel);

        $panel.find('#ow_generate_now').on('click', () => {
            const so = settings().offscreen;
            const withTables = so.enabled && so.followWidgets;
            startBackgroundTask(withTables ? '组件与表格' : '组件', () => runGenerationPipeline());
        });
        $panel.find('#ow_widget_list_btn').on('click', () => openWidgetListDialog($panel));
        refreshGeneratingIndicator();
    }

    // 组件预览用 iframe 渲染（sandbox 无 allow-same-origin，父页面读不到内部高度），
    // 所以往 srcdoc 里注入一小段脚本，让它把自身高度 postMessage 回来，父页面据此调整高度，
    // 避免内容被固定高度截断只显示一半。
    function buildPreviewSrcdoc(innerHtml, frameId) {
        return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  html,body{margin:0;padding:0;background:#fff;}
  body{padding:12px;box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;line-height:1.6;}
  img,video,canvas,table{max-width:100%;}
</style></head><body>
${innerHtml}
<script>
(function(){
  var id=${JSON.stringify(frameId)};
  function send(){
    try{
      var h=Math.max(document.documentElement.scrollHeight,document.body?document.body.scrollHeight:0);
      parent.postMessage({__owFrame:id,height:h},'*');
    }catch(e){}
  }
  window.addEventListener('load',send);
  document.addEventListener('DOMContentLoaded',send);
  [50,200,600,1200,2000].forEach(function(t){setTimeout(send,t);});
  try{ new ResizeObserver(send).observe(document.documentElement); }catch(e){}
  window.addEventListener('resize',send);
})();
<\/script>
</body></html>`;
    }

    // 父页面统一监听所有预览 iframe 的高度回报（只注册一次）
    let previewResizeBound = false;
    function bindPreviewAutoResize() {
        if (previewResizeBound) return;
        previewResizeBound = true;
        window.addEventListener('message', (ev) => {
            const d = ev.data;
            if (!d || !d.__owFrame || typeof d.height !== 'number') return;
            const el = document.querySelector(`iframe[data-frame-id="${d.__owFrame}"]`);
            if (!el) return;
            const h = Math.min(Math.max(d.height + 8, 120), 5000);
            if (Math.abs(parseInt(el.style.height || '0', 10) - h) > 2) el.style.height = h + 'px';
        });
    }

    // ---- 组件显示（占满整个面板）----
    function renderWidgetResults($panel) {
        const s = settings();
        const cd = chatData();
        const $results = $panel.find('#ow_widget_results');
        $results.empty();

        bindPreviewAutoResize();
        const withResults = s.widgets.filter((w) => cd.widgetResults[w.id]);
        if (!withResults.length) {
            $results.append('<div class="ow-empty">还没有生成结果。点「生成全部组件」，或在右上角「组件列表」里新建/单独生成。</div>');
            return;
        }
        for (const w of withResults) {
            const result = cd.widgetResults[w.id];
            $results.append(`
              <div class="ow-result-frame-wrap" data-id="${w.id}">
                <div class="ow-result-head">
                  <span>${escapeHtml(w.name)} — ${result.error ? '⚠️ 失败' : new Date(result.updatedAt).toLocaleString()}</span>
                  <span>
                    <button class="ow-btn ow-fav-btn" data-action="favorite" data-id="${w.id}" title="收藏到收藏夹">
                      <i class="${isFavorited(w.id) ? 'fa-solid' : 'fa-regular'} fa-star"></i>
                    </button>
                    <button class="ow-btn" data-action="fullscreen" data-id="${w.id}" title="全屏"><i class="fa-solid fa-expand"></i></button>
                    <button class="ow-btn" data-action="view-raw" data-id="${w.id}">源码</button>
                    <button class="ow-btn ow-gen-btn" data-action="regen-one" data-id="${w.id}">重新生成</button>
                  </span>
                </div>
                <iframe class="ow-result-frame" data-frame-id="${w.id}" sandbox="allow-scripts" allowfullscreen srcdoc="${escapeHtml(buildPreviewSrcdoc(result.html, w.id))}"></iframe>
              </div>`);
        }

        $results.off('click', '[data-action="view-raw"]').on('click', '[data-action="view-raw"]', function () {
            const res = chatData().widgetResults[$(this).data('id')];
            if (!res) return;
            const w = window.open('', '_blank');
            if (w) w.document.write(`<pre style="white-space:pre-wrap;word-break:break-all;">${escapeHtml(res.html)}</pre>`);
        });

        $results.off('click', '[data-action="favorite"]').on('click', '[data-action="favorite"]', function () {
            const w = settings().widgets.find((x) => x.id === $(this).data('id'));
            if (w) openFavoriteDialog(w);
        });

        $results.off('click', '[data-action="fullscreen"]').on('click', '[data-action="fullscreen"]', function () {
            const id = $(this).data('id');
            const el = $results.find(`.ow-result-frame-wrap[data-id="${id}"] iframe`)[0];
            if (!el) return;
            const req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
            if (req) req.call(el).catch((err) => toast(`无法进入全屏：${err.message || err}`, 'warning'));
            else toast('当前浏览器不支持全屏 API', 'warning');
        });

        $results.off('click', '[data-action="regen-one"]').on('click', '[data-action="regen-one"]', function () {
            const id = $(this).data('id');
            const w = settings().widgets.find((x) => x.id === id);
            if (!w) return;
            startBackgroundTask(`组件：${w.name}`, async () => {
                await generateWidget(w);
                updateInjections();
            });
        });
        refreshGeneratingIndicator();
    }

    // ---------------- 组件列表子弹窗 ----------------
    function openWidgetListDialog($widgetsPanel) {
        const s = settings();
        const $ov = $(`
        <div class="ow-sub-overlay">
          <div class="ow-sub-modal">
            <div class="ow-modal-header">
              <div class="ow-modal-title">组件列表</div>
              <div class="ow-close-btn ow-sub-close"><i class="fa-solid fa-xmark"></i></div>
            </div>
            <div class="ow-sub-body">
              <div class="ow-row"><button class="ow-btn ow-primary" id="ow_add_widget"><i class="fa-solid fa-plus"></i> 新建组件</button></div>
              <div id="ow_widget_list"></div>
            </div>
          </div>
        </div>`).appendTo(document.documentElement);

        const close = () => { $ov.remove(); renderWidgetsPanel($widgetsPanel); };
        $ov.on('click', (e) => { if ($(e.target).hasClass('ow-sub-overlay')) close(); });
        $ov.find('.ow-sub-close').on('click', close);

        const renderList = () => {
            const $list = $ov.find('#ow_widget_list');
            $list.empty();
            if (!s.widgets.length) {
                $list.append('<div class="ow-empty">还没有组件，点上方「新建组件」添加。</div>');
                return;
            }
            for (const w of s.widgets) $list.append(renderWidgetCard(w));
        };
        renderList();

        $ov.find('#ow_add_widget').on('click', () => {
            s.widgets.push({ id: uid(), name: '新组件', prompt: '', enabled: true, presetEntries: [] });
            saveSettings();
            renderList();
        });

        bindWidgetCardEvents($ov, renderList);
    }

    function renderWidgetCard(widget) {
        const chips = (widget.presetEntries || [])
            .map((e, idx) => `<span class="ow-chip" data-widget="${widget.id}" data-idx="${idx}">${escapeHtml(e.name)}<span class="ow-chip-x" title="移除">✕</span></span>`)
            .join('');
        const presetCount = (widget.presetEntries || []).length;
        return $(`
        <div class="ow-widget-card ow-collapsed" data-id="${widget.id}">
          <div class="ow-widget-card-head">
            <span class="ow-caret" data-action="toggle-card" title="展开/收起"><i class="fa-solid fa-chevron-right"></i></span>
            <input type="checkbox" class="ow-enabled-toggle" ${widget.enabled ? 'checked' : ''} title="是否随批量生成">
            <span class="ow-widget-name" data-action="toggle-card">${escapeHtml(widget.name) || '<span class="ow-muted">未命名</span>'}</span>
            <span class="ow-muted ow-widget-meta">${presetCount ? `${presetCount} 条预设` : ''}</span>
            <span class="ow-spacer"></span>
            <button class="ow-btn ow-gen-btn" data-action="gen-one" title="单独生成"><i class="fa-solid fa-play"></i></button>
            <button class="ow-btn ow-danger" data-action="delete" title="删除"><i class="fa-solid fa-trash"></i></button>
          </div>
          <div class="ow-widget-card-body">
            <div class="ow-field-label">名称</div>
            <input type="text" class="ow-input ow-name-input" value="${escapeHtml(widget.name)}" placeholder="组件名称">
            <div class="ow-field-label">提示词</div>
            <textarea class="ow-textarea ow-prompt-input" placeholder="描述这个组件要生成什么…">${escapeHtml(widget.prompt)}</textarea>
            <div class="ow-field-label">预设条目</div>
            <div class="ow-row">
              <select class="ow-select ow-preset-select ow-grow"><option value="">选择预设…</option></select>
              <button class="ow-btn" data-action="load-preset">读取条目</button>
            </div>
            <div class="ow-preset-list" style="display:none;"></div>
            <div class="ow-preset-chips">${chips}</div>
          </div>
        </div>`);
    }

    function bindWidgetCardEvents($root, renderList) {
        const s = settings();

        $root.on('click', '[data-action="toggle-card"]', function () {
            const $card = $(this).closest('.ow-widget-card');
            $card.toggleClass('ow-collapsed');
            const expanded = !$card.hasClass('ow-collapsed');
            $card.find('.ow-caret i').attr('class', expanded ? 'fa-solid fa-chevron-down' : 'fa-solid fa-chevron-right');
            if (expanded) {
                // 展开时才填充预设下拉，避免列表很长时一次性构建大量 option
                const $sel = $card.find('.ow-preset-select');
                if ($sel.children().length <= 1) {
                    for (const n of getPresetNames()) $sel.append(`<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`);
                }
            }
        });

        $root.on('input', '.ow-name-input', function () {
            const $card = $(this).closest('.ow-widget-card');
            const w = s.widgets.find((x) => x.id === $card.data('id'));
            if (w) {
                w.name = $(this).val();
                saveSettings();
                $card.find('.ow-widget-name').text(w.name || '未命名');
            }
        });
        $root.on('input', '.ow-prompt-input', function () {
            const w = s.widgets.find((x) => x.id === $(this).closest('.ow-widget-card').data('id'));
            if (w) { w.prompt = $(this).val(); saveSettings(); }
        });
        $root.on('change', '.ow-enabled-toggle', function () {
            const w = s.widgets.find((x) => x.id === $(this).closest('.ow-widget-card').data('id'));
            if (w) { w.enabled = $(this).is(':checked'); saveSettings(); }
        });
        $root.on('click', '[data-action="delete"]', function () {
            const id = $(this).closest('.ow-widget-card').data('id');
            if (!confirm('确定删除该组件吗？')) return;
            s.widgets = s.widgets.filter((x) => x.id !== id);
            delete chatData().widgetResults[id];
            saveSettings(); saveChatData();
            renderList();
        });
        $root.on('click', '[data-action="gen-one"]', function () {
            const w = s.widgets.find((x) => x.id === $(this).closest('.ow-widget-card').data('id'));
            if (!w) return;
            startBackgroundTask(`组件：${w.name}`, async () => {
                await generateWidget(w);
                updateInjections();
            });
        });
        $root.on('click', '[data-action="load-preset"]', function () {
            const $card = $(this).closest('.ow-widget-card');
            const presetName = $card.find('.ow-preset-select').val();
            if (!presetName) { toast('请先选择一个预设', 'warning'); return; }
            const entries = getPresetEntries(presetName);
            const $list = $card.find('.ow-preset-list');
            if (!entries.length) {
                $list.html('<div class="ow-muted">该预设下没有可用条目（或当前主 API 不是 Chat Completion 类型）。</div>').show();
                return;
            }
            $list.html(entries.map((e, idx) => `
                <div class="ow-preset-entry">
                  <input type="checkbox" data-idx="${idx}">
                  <label title="${escapeHtml(e.content).slice(0, 300)}">${escapeHtml(e.name)}</label>
                </div>`).join('') +
                `<div class="ow-row" style="margin-top:6px;"><button class="ow-btn ow-primary" data-action="confirm-add-preset">添加勾选条目</button></div>`).show();
            $list.data('entries', entries);
        });
        $root.on('click', '[data-action="confirm-add-preset"]', function () {
            const $card = $(this).closest('.ow-widget-card');
            const w = s.widgets.find((x) => x.id === $card.data('id'));
            const $list = $card.find('.ow-preset-list');
            const entries = $list.data('entries') || [];
            const checked = $list.find('input[type="checkbox"]:checked').map(function () { return Number($(this).data('idx')); }).get();
            if (!w || !checked.length) return;
            w.presetEntries = w.presetEntries || [];
            for (const idx of checked) {
                const e = entries[idx];
                if (e && !w.presetEntries.some((x) => x.identifier === e.identifier)) w.presetEntries.push(e);
            }
            saveSettings();
            renderList();
        });
        $root.on('click', '.ow-chip-x', function (e) {
            e.stopPropagation();
            const $chip = $(this).closest('.ow-chip');
            const w = s.widgets.find((x) => x.id === $chip.data('widget'));
            if (w) { w.presetEntries.splice($chip.data('idx'), 1); saveSettings(); renderList(); }
        });
    }

    // ---------------- 镜头之外面板 ----------------

    function getOffscreenTables({ onlyEnabled = false } = {}) {
        const list = settings().offscreenTables || [];
        return onlyEnabled ? list.filter((t) => t.enabled !== false) : list;
    }

    function getTableDef(key) {
        return getOffscreenTables().find((t) => t.key === key);
    }

    function rowFactoryFor(tableDef) {
        const row = {};
        for (const c of tableDef.columns) row[c.field] = '';
        return row;
    }

    // 通用行归一化：优先取英文 field，其次取中文列名作为别名，兼容模型返回中文键名
    // 把模型返回的任意键名尽量对齐到我们的列字段。
    // 现实里模型经常不严格按 JSON 示例的英文键名输出，会用中文列名、近义词、
    // 带下划线的变体等；此前只匹配 field / label 两种写法，匹配不上就整列为空
    // （伏笔表"内容"列空白就是这么来的）。这里做多级模糊匹配，并在匹配失败时
    // 把该行实际返回的键名写进日志，方便直接定位模型到底用了什么字段名。
    const COLUMN_ALIASES = {
        content: ['内容', '描述', '详情', '伏笔内容', '伏笔', 'description', 'detail', 'desc', 'text', 'summary'],
        tag: ['标签', '编号', 'id', 'label', 'marker'],
        name: ['名称', '姓名', '名字', 'title'],
        chapter: ['章节', '埋设章节', '关联章节', '所在章节', 'chapters'],
        chapters: ['章节', '关联章节', 'chapter'],
        status: ['状态', '当前状态', 'state'],
        time: ['时间', '日期', 'datetime', 'date'],
        task: ['事项', '任务', '事件', 'event', 'todo'],
        location: ['位置', '当前位置', '地点', '地理位置', 'place', 'position'],
        role: ['角色', '人物', 'character', 'name'],
        usage: ['用途', '作用', 'purpose', 'use'],
        structure: ['构造', '构造细节', '环境细节', '细节', 'detail', 'details'],
        alias: ['昵称', '别名', 'nickname'],
        relation: ['关系', '与用户的关系', 'relationship'],
        attitude: ['态度', '对用户的态度'],
        routine: ['固定日程规律', '日程规律', '规律', 'schedule'],
        seasonal: ['时节性必然事件', '时节性事件', '季节性事件'],
        pool: ['弹性事务参考池', '弹性事务', '参考池'],
    };

    function canonKey(k) {
        return String(k).toLowerCase().replace(/[\s_\-/|:：，,。.、()（）\[\]【】]/g, '');
    }

    function stringifyCell(v) {
        if (v === null || v === undefined) return '';
        if (typeof v === 'string') return v;
        if (typeof v === 'number' || typeof v === 'boolean') return String(v);
        if (Array.isArray(v)) return v.map(stringifyCell).filter(Boolean).join('；');
        if (typeof v === 'object') {
            // 模型偶尔会把一格写成对象，退化成 "键:值" 拼接，至少不丢内容
            return Object.entries(v).map(([k, val]) => `${k}:${stringifyCell(val)}`).join('；');
        }
        return String(v);
    }

    function pickCellValue(row, col) {
        if (!row || typeof row !== 'object') return { value: '', matchedKey: null };
        // 1) 精确匹配 field / label
        for (const k of [col.field, col.label]) {
            if (k != null && row[k] !== undefined && row[k] !== null && row[k] !== '') {
                return { value: stringifyCell(row[k]), matchedKey: k };
            }
        }
        // 2) 归一化后匹配 field / label / 别名
        const candidates = [col.field, col.label, ...(COLUMN_ALIASES[col.field] || [])].filter(Boolean).map(canonKey);
        for (const rk of Object.keys(row)) {
            if (candidates.includes(canonKey(rk)) && row[rk] !== undefined && row[rk] !== null && row[rk] !== '') {
                return { value: stringifyCell(row[rk]), matchedKey: rk };
            }
        }
        // 3) 归一化后的包含关系（如 "伏笔内容" 对 "内容"）
        for (const rk of Object.keys(row)) {
            const ck = canonKey(rk);
            if (!row[rk]) continue;
            for (const cand of candidates) {
                if (cand.length >= 2 && (ck.includes(cand) || cand.includes(ck))) {
                    return { value: stringifyCell(row[rk]), matchedKey: rk };
                }
            }
        }
        return { value: '', matchedKey: null };
    }

    function normalizeRowsGeneric(rows, columns, tableTitle = '') {
        const unmatchedReport = [];
        const result = rows.map((r, i) => {
            const out = {};
            const usedKeys = new Set();
            const emptyCols = [];
            for (const c of columns) {
                const { value, matchedKey } = pickCellValue(r, c);
                out[c.field] = value;
                if (matchedKey) usedKeys.add(matchedKey);
                else if (!value) emptyCols.push(`${c.field}/${c.label}`);
            }
            if (emptyCols.length && r && typeof r === 'object') {
                const leftover = Object.keys(r).filter((k) => !usedKeys.has(k));
                if (leftover.length) {
                    unmatchedReport.push({ row: i, 空列: emptyCols, 该行实际返回的未匹配键: leftover, 原始行: r });
                }
            }
            return out;
        });
        if (unmatchedReport.length) {
            log('warn', 'parse',
                `「${tableTitle}」有列没能从模型返回里匹配到值。下面列出这些行实际用的键名——如果模型一直用某个固定的别名，可以到「表格管理」把该列的字段名改成它，或在提示词里强调键名。`,
                unmatchedReport);
        }
        return result;
    }

    function renderOffscreenPanel($panel) {
        const s = settings();
        const off = chatData().offscreen;
        const tables = getOffscreenTables({ onlyEnabled: true });

        let html = `
        <div class="ow-panel-bar">
          <div class="ow-row" style="margin:0;">
            <button class="ow-btn ow-primary ow-gen-btn" id="ow_off_generate"><i class="fa-solid fa-wand-magic-sparkles"></i> 生成/更新</button>
            <span class="ow-muted">${off.updatedAt ? `上次更新 ${new Date(off.updatedAt).toLocaleString()}` : '尚未生成'}</span>
            ${s.offscreen.enabled ? '' : '<span class="ow-muted">（未启用：不会随组件生成，也不会注入正文；此处仍可手动生成。可在设置里启用）</span>'}
          </div>
          <button class="ow-btn" id="ow_table_manager_btn"><i class="fa-solid fa-table-list"></i> 表格管理</button>
        </div>
        <div id="ow_offscreen_tables"></div>`;
        $panel.html(html);

        const $wrap = $panel.find('#ow_offscreen_tables');
        if (!tables.length) {
            $wrap.html('<div class="ow-empty">没有启用任何表格。点右上角「表格管理」开启或新建表格。</div>');
        } else {
            let tHtml = '';
            for (const t of tables) {
                tHtml += `
                <div class="ow-section-title">${escapeHtml(t.title)}</div>
                <table class="ow-table" data-table-key="${escapeHtml(t.key)}">
                  <thead><tr>${t.columns.map((c) => `<th>${escapeHtml(c.label)}</th>`).join('')}<th></th></tr></thead>
                  <tbody></tbody>
                </table>
                <div class="ow-row"><button class="ow-btn" data-action="add-row" data-table-key="${escapeHtml(t.key)}">+ 添加一行</button></div>`;
            }
            $wrap.html(tHtml);
            for (const t of tables) {
                const $tbody = $wrap.find(`table[data-table-key="${t.key}"] tbody`);
                for (const row of off.tables?.[t.key] || []) $tbody.append(offscreenRowHtml(t, row));
            }
        }

        $panel.find('#ow_off_generate').on('click', function () {
            startBackgroundTask('表格生成', () => generateOffscreen());
        });

        $panel.find('#ow_table_manager_btn').on('click', () => openTableManager($panel));

        $wrap.find('[data-action="add-row"]').on('click', function () {
            const key = $(this).data('table-key');
            const t = getTableDef(key);
            if (!t) return;
            off.tables = off.tables || {};
            off.tables[key] = off.tables[key] || [];
            off.tables[key].push(rowFactoryFor(t));
            saveChatData();
            renderOffscreenPanel($panel);
        });

        bindOffscreenTableEvents($wrap, off, tables);
        refreshGeneratingIndicator();
    }

    function offscreenRowHtml(tableDef, row) {
        const cells = tableDef.columns
            .map((c) => `<td contenteditable="true" data-field="${escapeHtml(c.field)}">${escapeHtml(row[c.field])}</td>`)
            .join('');
        return `<tr>${cells}<td><button class="ow-btn ow-danger" data-action="del-row">✕</button></td></tr>`;
    }

    function bindOffscreenTableEvents($wrap, off, tables) {
        for (const t of tables) {
            const $table = $wrap.find(`table[data-table-key="${t.key}"]`);
            $table.on('blur', 'td[contenteditable]', function () {
                const idx = $(this).closest('tr').index();
                const field = $(this).data('field');
                if (off.tables?.[t.key]?.[idx]) { off.tables[t.key][idx][field] = $(this).text(); saveChatData(); }
            });
            $table.on('click', '[data-action="del-row"]', function () {
                const idx = $(this).closest('tr').index();
                off.tables?.[t.key]?.splice(idx, 1);
                saveChatData();
                $(this).closest('tr').remove();
            });
        }
    }

    // ---------------- 表格管理子弹窗 ----------------
    function openTableManager($offscreenPanel) {
        const s = settings();
        const $ov = $(`
        <div class="ow-sub-overlay">
          <div class="ow-sub-modal">
            <div class="ow-modal-header">
              <div class="ow-modal-title">表格管理</div>
              <div class="ow-close-btn ow-sub-close"><i class="fa-solid fa-xmark"></i></div>
            </div>
            <div class="ow-sub-body">
              <div class="ow-hint">左侧开关：开＝生成该表并把规则写进提示词；关＝不生成、不显示、提示词也不含它。点表名展开可编辑列与规则。</div>
              <div id="ow_table_mgr_list"></div>
              <div class="ow-row" style="margin-top:12px;">
                <button class="ow-btn ow-primary" id="ow_table_add">+ 新建表格</button>
                <button class="ow-btn" id="ow_table_reset">恢复默认表格</button>
              </div>
            </div>
          </div>
        </div>`).appendTo(document.documentElement);

        const close = () => { $ov.remove(); renderOffscreenPanel($offscreenPanel); };
        $ov.on('click', (e) => { if ($(e.target).hasClass('ow-sub-overlay')) close(); });
        $ov.find('.ow-sub-close').on('click', close);

        function renderList() {
            const $list = $ov.find('#ow_table_mgr_list');
            const tables = getOffscreenTables();
            if (!tables.length) { $list.html('<div class="ow-empty">还没有表格</div>'); return; }
            $list.html(tables.map((t, i) => {
                const on = t.enabled !== false;
                return `
              <div class="ow-widget-card ow-collapsed" data-key="${escapeHtml(t.key)}">
                <div class="ow-widget-card-head">
                  <span class="ow-caret" data-action="tbl-toggle-card" title="展开/收起"><i class="fa-solid fa-chevron-right"></i></span>
                  <label class="ow-switch" title="${on ? '已启用：会生成并显示，提示词包含该表' : '已禁用：不生成、不显示，提示词不含该表'}">
                    <input type="checkbox" class="ow-tbl-enabled" ${on ? 'checked' : ''}><span class="ow-switch-track"></span>
                  </label>
                  <span class="ow-widget-name" data-action="tbl-toggle-card">${escapeHtml(t.title)}</span>
                  <span class="ow-muted ow-widget-meta ow-tbl-status">${on ? '启用' : '禁用'} · ${t.columns.length}列</span>
                  <span class="ow-spacer"></span>
                  <button class="ow-btn" data-action="tbl-up" title="上移" ${i === 0 ? 'disabled' : ''}>↑</button>
                  <button class="ow-btn" data-action="tbl-down" title="下移" ${i === tables.length - 1 ? 'disabled' : ''}>↓</button>
                  <button class="ow-btn ow-danger" data-action="tbl-del" title="删除">✕</button>
                </div>
                <div class="ow-widget-card-body">
                  <div class="ow-field-label">表名</div>
                  <input type="text" class="ow-input ow-tbl-title" value="${escapeHtml(t.title)}" placeholder="表名">
                  <div class="ow-field-label">列（英文字段名:中文列名，每行一个）</div>
                  <textarea class="ow-textarea ow-tbl-cols" style="min-height:70px;">${escapeHtml(t.columns.map((c) => `${c.field}:${c.label}`).join('\n'))}</textarea>
                  <div class="ow-field-label">规则说明（原样写进提示词）</div>
                  <textarea class="ow-textarea ow-tbl-spec" style="min-height:110px;">${escapeHtml(t.spec || '')}</textarea>
                </div>
              </div>`;
            }).join(''));
        }
        renderList();

        $ov.on('click', '[data-action="tbl-toggle-card"]', function () {
            const $card = $(this).closest('.ow-widget-card');
            $card.toggleClass('ow-collapsed');
            const expanded = !$card.hasClass('ow-collapsed');
            $card.find('.ow-caret i').attr('class', expanded ? 'fa-solid fa-chevron-down' : 'fa-solid fa-chevron-right');
        });
        $ov.on('change', '.ow-tbl-enabled', function () {
            const $card = $(this).closest('.ow-widget-card');
            const t = getTableDef($card.data('key'));
            if (!t) return;
            t.enabled = $(this).is(':checked');
            saveSettings();
            $card.find('.ow-tbl-status').text(`${t.enabled ? '启用' : '禁用'} · ${t.columns.length}列`);
            log('info', 'ui', `表格「${t.title}」已${t.enabled ? '启用（提示词将包含该表）' : '禁用（提示词不再包含该表）'}`);
        });
        $ov.on('input', '.ow-tbl-title', function () {
            const key = $(this).closest('.ow-widget-card').data('key');
            const $card = $(this).closest('.ow-widget-card');
            const t = getTableDef($card.data('key'));
            if (t) { t.title = $(this).val(); saveSettings(); $card.find('.ow-widget-name').text(t.title || '未命名'); }
        });
        $ov.on('input', '.ow-tbl-spec', function () {
            const key = $(this).closest('.ow-widget-card').data('key');
            const t = getTableDef(key); if (t) { t.spec = $(this).val(); saveSettings(); }
        });
        $ov.on('change', '.ow-tbl-cols', function () {
            const key = $(this).closest('.ow-widget-card').data('key');
            const t = getTableDef(key); if (!t) return;
            const cols = String($(this).val()).split('\n').map((line) => {
                const [field, label] = line.split(':');
                if (!field?.trim()) return null;
                return { field: field.trim(), label: (label || field).trim() };
            }).filter(Boolean);
            if (!cols.length) { toast('至少要有一列', 'warning'); renderList(); return; }
            t.columns = cols;
            saveSettings();
            log('info', 'ui', `表格「${t.title}」的列已更新为：${cols.map((c) => c.field).join(', ')}`);
        });
        $ov.on('click', '[data-action="tbl-del"]', function () {
            const key = $(this).closest('.ow-widget-card').data('key');
            const t = getTableDef(key);
            if (!t || !confirm(`确定删除表格「${t.title}」吗？该表已生成的数据也会一并删除。`)) return;
            s.offscreenTables = s.offscreenTables.filter((x) => x.key !== key);
            const off = chatData().offscreen;
            if (off.tables) delete off.tables[key];
            saveSettings(); saveChatData();
            renderList();
        });
        const move = (key, dir) => {
            const i = s.offscreenTables.findIndex((x) => x.key === key);
            const j = i + dir;
            if (i < 0 || j < 0 || j >= s.offscreenTables.length) return;
            [s.offscreenTables[i], s.offscreenTables[j]] = [s.offscreenTables[j], s.offscreenTables[i]];
            saveSettings(); renderList();
        };
        $ov.on('click', '[data-action="tbl-up"]', function () { move($(this).closest('.ow-widget-card').data('key'), -1); });
        $ov.on('click', '[data-action="tbl-down"]', function () { move($(this).closest('.ow-widget-card').data('key'), 1); });

        $ov.find('#ow_table_add').on('click', function () {
            const name = prompt('新表格的名称：', '新表格');
            if (!name) return;
            const key = `custom_${Date.now().toString(36)}`;
            s.offscreenTables.push({
                key,
                jsonKey: key,
                title: name,
                enabled: true,
                columns: [{ field: 'col1', label: '列1' }, { field: 'col2', label: '列2' }],
                spec: `列结构：列1 | 列2\n（在此填写该表的收录标准、更新与删除规则）`,
            });
            saveSettings();
            renderList();
        });
        $ov.find('#ow_table_reset').on('click', function () {
            if (!confirm('确定恢复为默认的六张表吗？自定义表格定义会丢失（已生成的数据保留）。')) return;
            s.offscreenTables = defaultOffscreenTables();
            saveSettings();
            renderList();
        });
    }

    // ---------------- 设置面板 ----------------
    // ---------------- 关于/更新区块 ----------------
    function renderUpdateSection($panel) {
        const $status = $panel.find('#ow_update_status');
        if (!$status.length) return;

        if (!updateState.checked) {
            $status.html(`未能获取版本信息。<br>
                <span class="ow-muted">尝试的 extensionName：<code>${escapeHtml(EXTENSION_ID_PARAM)}</code>（用户扩展与全局扩展两种方式都试过了）。
                详细请求结果见「日志」标签页。也可以直接用酒馆自带的扩展管理器更新（更可靠）。</span>`);
            return;
        }
        const shortHash = (updateState.currentCommitHash || '').slice(0, 7);
        if (!shortHash) {
            // 服务端明确回了 200 但没有 commit hash：该目录不是 Git 仓库
            $status.html(`该扩展目录不是 Git 仓库，无法自动更新。<br>
                <span class="ow-muted">常见原因：是手动解压/复制安装的，而不是在酒馆里用 Git 地址安装。
                解决办法：卸载后用「Install extension」粘贴仓库地址重装，之后就能自动更新了。</span>`);
            return;
        }
        const where = updateState.global ? '全局扩展' : '用户扩展';
        if (updateState.isUpToDate) {
            $status.html(`✅ 已是最新版本 <span class="ow-muted">（${where} · ${escapeHtml(shortHash)}${updateState.currentBranchName ? ' · ' + escapeHtml(updateState.currentBranchName) : ''}）</span>`);
            updateMenuBadge();
        } else {
            $status.html(`⚠️ 有新版本可更新 <span class="ow-muted">（${where} · 当前 ${escapeHtml(shortHash)}）</span>
                <button class="ow-btn ow-primary" id="ow_do_update" style="margin-left:8px;">立即更新</button>`);
            $panel.find('#ow_do_update').on('click', async function () {
                const $btn = $(this);
                $btn.prop('disabled', true).text('更新中…');
                try {
                    const result = await performExtensionUpdate();
                    toast(`已更新到 ${result.shortCommitHash || '最新版本'}，刷新页面生效`, 'success');
                    if (confirm('扩展已更新完成，是否立即刷新页面？')) location.reload();
                    else { $status.html(`✅ 已更新，请手动刷新页面`); updateMenuBadge(); if ($modal) renderUpdateBanner($modal); }
                } catch (err) {
                    toast(`更新失败：${err.message || err}`, 'error');
                    $status.append(`<br><span class="ow-muted">更新请求失败：${escapeHtml(String(err.message || err))}。可改用酒馆扩展管理器更新。</span>`);
                    $btn.prop('disabled', false).text('立即更新');
                }
            });
            updateMenuBadge();
        }
    }

    // ---------------- 剧情推演面板（思维树） ----------------
    function renderPlotPanel($panel) {
        const s = settings();
        const pl = chatData().plot;
        const dirs = (s.plot.directions || []).filter((d) => d.enabled).map((d) => d.name);

        $panel.html(`
        <div class="ow-panel-bar">
          <div class="ow-row" style="margin:0;">
            <button class="ow-btn ow-primary ow-gen-btn" id="ow_plot_gen"><i class="fa-solid fa-wand-magic-sparkles"></i> 生成推演</button>
            <button class="ow-btn" id="ow_plot_custom_btn"><i class="fa-solid fa-pen-to-square"></i> 自定义事件${String(s.plot.customEvents || '').trim() ? '<span class="ow-log-badge">已填</span>' : ''}</button>
            <span class="ow-muted">${pl.events.length ? `${pl.events.length} 个事件` : '尚未生成'}${pl.updatedAt ? ' · ' + new Date(pl.updatedAt).toLocaleString() : ''}</span>
          </div>
          <button class="ow-btn" id="ow_plot_dir_btn"><i class="fa-solid fa-compass"></i> 发展方向${dirs.length ? `（${dirs.length}）` : ''}</button>
        </div>
        ${dirs.length ? `<div class="ow-row" style="margin-top:-4px;margin-bottom:10px;">${dirs.map((d) => `<span class="ow-chip">${escapeHtml(d)}</span>`).join('')}</div>` : ''}
        <div id="ow_plot_tree"></div>`);

        const $tree = $panel.find('#ow_plot_tree');
        if (!pl.events.length) {
            $tree.html('<div class="ow-empty">还没有推演。点右上角选择发展方向，再点「生成推演」。<br><span class="ow-muted">生成后当前事件会自动注入聊天，正文里事件结束时会带隐藏标记，扩展会自动置灰未走的分支并推进。</span></div>');
        } else {
            $tree.html(renderPlotTreeHtml(pl));
        }

        $panel.find('#ow_plot_gen').on('click', function () {
            startBackgroundTask('剧情推演', () => generatePlot());
        });
        $panel.find('#ow_plot_dir_btn').on('click', () => openDirectionsDialog($panel));
        $panel.find('#ow_plot_custom_btn').on('click', () => openCustomEventsDialog($panel));

        // 手动把某条分支标记为"已走"（模型没输出标记时的兜底）
        $tree.on('click', '[data-action="plot-take"]', function () {
            const evId = $(this).data('event');
            const key = String($(this).data('key'));
            const ev = getPlotEvent(evId);
            if (!ev) return;
            const taken = ev.branches.find((b) => b.key === key);
            if (!taken) return;
            if (!confirm(`手动把事件 ${evId} 标记为经分支 ${key} 结束？其他分支会被置灰，并推进到 ${taken.next || '结局'}。`)) return;
            pl.deadBranches[evId] = ev.branches.filter((b) => b.key !== key).map((b) => b.key);
            pl.path.push({ eventId: evId, branchKey: key, at: Date.now(), manual: true });
            pl.currentId = (taken.next && taken.next.toUpperCase() !== 'END' && getPlotEvent(taken.next)) ? taken.next : '';
            saveChatData();
            updateInjections();
            log('info', 'ui', `手动推进：事件 ${evId} → 分支 ${key} → ${pl.currentId || '结局'}`);
            renderPlotPanel($panel);
        });

        $tree.on('click', '[data-action="plot-goto"]', function () {
            const evId = $(this).data('event');
            if (!getPlotEvent(evId)) return;
            pl.currentId = evId;
            saveChatData();
            updateInjections();
            toast(`当前事件已设为 ${evId}`, 'success');
            renderPlotPanel($panel);
        });

        $tree.on('click', '[data-action="plot-reset"]', function () {
            if (!confirm('清空推演进度（置灰状态与已走路径），事件矩阵保留？')) return;
            pl.deadBranches = {};
            pl.path = [];
            pl.currentId = pl.events[0]?.id || '';
            saveChatData();
            updateInjections();
            renderPlotPanel($panel);
        });

        refreshGeneratingIndicator();
    }

    function renderPlotTreeHtml(pl) {
        const doneIds = new Set(pl.path.map((p) => p.eventId));
        let html = `<div class="ow-row" style="margin-bottom:10px;">
            <span class="ow-muted">当前事件：${pl.currentId ? `<b>[事件${escapeHtml(pl.currentId)}]</b>` : '（已抵达结局或未设定）'}</span>
            <span class="ow-spacer"></span>
            <button class="ow-btn" data-action="plot-reset">重置进度</button>
        </div><div class="ow-tree">`;

        for (const ev of pl.events) {
            const isCurrent = ev.id === pl.currentId;
            const isDone = doneIds.has(ev.id);
            const dead = pl.deadBranches[ev.id] || [];
            const cls = ['ow-tree-node'];
            if (isCurrent) cls.push('ow-node-current');
            if (isDone) cls.push('ow-node-done');
            html += `
            <div class="${cls.join(' ')}" data-event="${escapeHtml(ev.id)}">
              <div class="ow-node-head">
                <span class="ow-node-id">${escapeHtml(ev.id)}</span>
                <span class="ow-node-title">${escapeHtml(ev.title)}</span>
                ${isCurrent ? '<span class="ow-node-badge ow-badge-current">进行中</span>' : ''}
                ${isDone ? '<span class="ow-node-badge ow-badge-done">已经历</span>' : ''}
                <span class="ow-spacer"></span>
                ${!isCurrent ? `<button class="ow-btn" data-action="plot-goto" data-event="${escapeHtml(ev.id)}" title="设为当前事件"><i class="fa-solid fa-location-crosshairs"></i></button>` : ''}
              </div>
              ${ev.core ? `<div class="ow-node-line"><span class="ow-node-label">核心</span>${escapeHtml(ev.core)}</div>` : ''}
              ${ev.trigger ? `<div class="ow-node-line"><span class="ow-node-label">导火索</span>${escapeHtml(ev.trigger)}</div>` : ''}
              <div class="ow-branches">
                ${ev.branches.map((b) => {
                    const isDead = dead.includes(b.key);
                    const wasTaken = pl.path.some((x) => x.eventId === ev.id && x.branchKey === b.key);
                    const bcls = ['ow-branch'];
                    if (isDead) bcls.push('ow-branch-dead');
                    if (wasTaken) bcls.push('ow-branch-taken');
                    const nx = String(b.next || '').toUpperCase();
                    const nextLabel = !b.next ? '未指定'
                        : nx === 'END' ? '最终结局'
                        : nx === 'OPEN' ? '开放结局（可续写）'
                        : `事件${b.next}`;
                    return `
                    <div class="${bcls.join(' ')}">
                      <span class="ow-branch-key">${escapeHtml(b.key)}</span>
                      <span class="ow-branch-cond">${escapeHtml(b.condition || '（条件未写明）')}</span>
                      <span class="ow-branch-arrow">→</span>
                      <span class="ow-branch-next">${escapeHtml(nextLabel)}</span>
                      ${(!isDead && !wasTaken) ? `<button class="ow-btn ow-branch-take" data-action="plot-take" data-event="${escapeHtml(ev.id)}" data-key="${escapeHtml(b.key)}" title="手动标记走这条分支">走这条</button>` : ''}
                    </div>`;
                }).join('')}
              </div>
            </div>`;
        }
        html += '</div>';
        return html;
    }

    // ---------------- 自定义事件子弹窗 ----------------
    function openCustomEventsDialog($plotPanel) {
        const s = settings();
        const $ov = $(`
        <div class="ow-sub-overlay">
          <div class="ow-sub-modal" style="height:auto;max-height:80vh;width:min(620px,93vw);">
            <div class="ow-modal-header">
              <div class="ow-modal-title">自定义事件</div>
              <div class="ow-close-btn ow-sub-close"><i class="fa-solid fa-xmark"></i></div>
            </div>
            <div class="ow-sub-body">
              <div class="ow-hint">按点写，一行一个事件，只写你想要发生什么，不用写分支与细节——模型会补上戏剧核心、导火索与情感分支。<br>
              这里写的每一条都<b>必须</b>出现在生成的矩阵里；不够设定的节点数时，其余由模型补全。留空则完全由模型自由发挥。</div>
              <textarea class="ow-textarea" id="ow_custom_events" style="min-height:200px;"
                placeholder="例如：&#10;两人被困在电梯里一整夜&#10;她发现了他藏了三年的那封信&#10;前任带着孩子突然出现在家门口">${escapeHtml(s.plot.customEvents || '')}</textarea>
              <div class="ow-row" style="margin-top:10px;justify-content:flex-end;">
                <button class="ow-btn ow-danger" id="ow_custom_clear">清空</button>
                <button class="ow-btn ow-primary ow-sub-close">完成</button>
              </div>
            </div>
          </div>
        </div>`).appendTo(document.documentElement);

        const close = () => { $ov.remove(); renderPlotPanel($plotPanel); };
        $ov.on('click', (e) => { if ($(e.target).hasClass('ow-sub-overlay')) close(); });
        $ov.find('.ow-sub-close').on('click', close);
        $ov.find('#ow_custom_events').on('input', function () {
            s.plot.customEvents = $(this).val();
            saveSettings();
        });
        $ov.find('#ow_custom_clear').on('click', function () {
            if (!confirm('清空自定义事件？')) return;
            s.plot.customEvents = '';
            saveSettings();
            $ov.find('#ow_custom_events').val('');
        });
    }

    // ---------------- 发展方向子弹窗（与组件列表/表格管理同款交互） ----------------
    function openDirectionsDialog($plotPanel) {
        const s = settings();
        const $ov = $(`
        <div class="ow-sub-overlay">
          <div class="ow-sub-modal">
            <div class="ow-modal-header">
              <div class="ow-modal-title">剧情发展方向</div>
              <div class="ow-close-btn ow-sub-close"><i class="fa-solid fa-xmark"></i></div>
            </div>
            <div class="ow-sub-body">
              <div class="ow-hint">勾选即启用（可多选）。点名称展开可编辑该方向的写作约束，这段文字会原样写进推演提示词，
              用"可以写/不可以写"限制模型不要发散。<br>只有勾选 HE 或 BE 时才允许生成真正的结局节点。</div>
              <div id="ow_dir_list"></div>
              <div class="ow-row" style="margin-top:12px;">
                <input type="text" class="ow-input ow-grow" id="ow_dir_new" placeholder="添加自定义方向，如：悬疑、复仇、青梅竹马">
                <button class="ow-btn ow-primary" id="ow_dir_add">添加</button>
                <button class="ow-btn" id="ow_dir_reset">恢复默认方向</button>
              </div>
            </div>
          </div>
        </div>`).appendTo(document.documentElement);

        const close = () => { $ov.remove(); renderPlotPanel($plotPanel); };
        $ov.on('click', (e) => { if ($(e.target).hasClass('ow-sub-overlay')) close(); });
        $ov.find('.ow-sub-close').on('click', close);

        const renderList = () => {
            const list = s.plot.directions || [];
            const $list = $ov.find('#ow_dir_list');
            if (!list.length) { $list.html('<div class="ow-empty">还没有方向</div>'); return; }
            $list.html(list.map((d) => `
              <div class="ow-widget-card ow-collapsed" data-id="${escapeHtml(d.id)}">
                <div class="ow-widget-card-head">
                  <span class="ow-caret" data-action="dir-toggle"><i class="fa-solid fa-chevron-right"></i></span>
                  <label class="ow-switch" title="${d.enabled ? '已启用' : '未启用'}">
                    <input type="checkbox" class="ow-dir-cb" ${d.enabled ? 'checked' : ''}><span class="ow-switch-track"></span>
                  </label>
                  <span class="ow-widget-name" data-action="dir-toggle">${escapeHtml(d.name)}</span>
                  <span class="ow-muted ow-widget-meta ow-dir-status">${d.enabled ? '启用' : '未启用'}</span>
                  <span class="ow-spacer"></span>
                  <button class="ow-btn ow-danger" data-action="dir-del" title="删除"><i class="fa-solid fa-trash"></i></button>
                </div>
                <div class="ow-widget-card-body">
                  <div class="ow-field-label">方向名称</div>
                  <input type="text" class="ow-input ow-dir-name" value="${escapeHtml(d.name)}">
                  <div class="ow-field-label">写作约束（写进提示词，建议写清"可以写 / 不可以写"）</div>
                  <textarea class="ow-textarea ow-dir-prompt" style="min-height:130px;" placeholder="可以写：…&#10;不可以写：…">${escapeHtml(d.prompt || '')}</textarea>
                </div>
              </div>`).join(''));
        };
        renderList();

        $ov.on('click', '[data-action="dir-toggle"]', function () {
            const $card = $(this).closest('.ow-widget-card');
            $card.toggleClass('ow-collapsed');
            const expanded = !$card.hasClass('ow-collapsed');
            $card.find('.ow-caret i').attr('class', expanded ? 'fa-solid fa-chevron-down' : 'fa-solid fa-chevron-right');
        });
        const findDir = (el) => s.plot.directions.find((x) => x.id === $(el).closest('.ow-widget-card').data('id'));
        $ov.on('change', '.ow-dir-cb', function () {
            const d = findDir(this); if (!d) return;
            d.enabled = $(this).is(':checked');
            saveSettings();
            $(this).closest('.ow-widget-card').find('.ow-dir-status').text(d.enabled ? '启用' : '未启用');
        });
        $ov.on('input', '.ow-dir-name', function () {
            const d = findDir(this); if (!d) return;
            d.name = $(this).val();
            saveSettings();
            $(this).closest('.ow-widget-card').find('.ow-widget-name').text(d.name || '未命名');
        });
        $ov.on('input', '.ow-dir-prompt', function () {
            const d = findDir(this); if (!d) return;
            d.prompt = $(this).val();
            saveSettings();
        });
        $ov.on('click', '[data-action="dir-del"]', function () {
            const d = findDir(this);
            if (!d || !confirm(`删除方向「${d.name}」？`)) return;
            s.plot.directions = s.plot.directions.filter((x) => x.id !== d.id);
            saveSettings();
            renderList();
        });

        const addDir = () => {
            const name = String($ov.find('#ow_dir_new').val() || '').trim();
            if (!name) return;
            if (s.plot.directions.some((x) => x.name === name)) { toast('已经有这个方向了', 'warning'); return; }
            s.plot.directions.push({
                id: `dir_${Date.now().toString(36)}`, name, enabled: true,
                prompt: `可以写：\n（列出这个方向下允许出现的情节类型）\n不可以写：\n（列出要禁止的内容，避免模型发散）`,
            });
            saveSettings();
            $ov.find('#ow_dir_new').val('');
            renderList();
        };
        $ov.find('#ow_dir_add').on('click', addDir);
        $ov.find('#ow_dir_new').on('keydown', (e) => { if (e.key === 'Enter') addDir(); });
        $ov.find('#ow_dir_reset').on('click', function () {
            if (!confirm('恢复为内置的 9 个方向？自定义方向与已编辑的约束会丢失。')) return;
            s.plot.directions = defaultPlotDirections();
            saveSettings();
            renderList();
        });
    }

    // ---------------- 世界书 / 聊天书发送设置面板 ----------------
    function renderWorldInfoPanel($panel) {
        $panel.html(`
        <div class="ow-panel-bar">
          <div class="ow-row" style="margin:0;">
            <button class="ow-btn ow-primary" id="ow_wi_refresh"><i class="fa-solid fa-rotate"></i> 刷新条目</button>
            <span class="ow-muted">来源：<span id="ow_wi_book_names">—</span></span>
          </div>
          <button class="ow-btn" id="ow_wi_reset">恢复默认</button>
        </div>
        <div class="ow-hint">默认跟随条目在酒馆中的启用状态；此处改动只影响本扩展，不改酒馆世界书。需在「设置 → 世界书」勾选后才会实际发送。</div>
        <div id="ow_wi_entry_list"></div>`);

        $panel.find('#ow_wi_refresh').on('click', () => loadAndRenderWorldInfoEntries($panel));
        $panel.find('#ow_wi_reset').on('click', () => {
            if (!confirm('确定清空所有手动覆盖，恢复为“跟随酒馆启用状态”吗？')) return;
            settings().worldInfoOverrides = {};
            saveSettings();
            log('info', 'ui', '已清空世界书发送覆盖设置');
            loadAndRenderWorldInfoEntries($panel);
        });

        loadAndRenderWorldInfoEntries($panel);
    }

    async function loadAndRenderWorldInfoEntries($panel) {
        const s = settings();
        const $list = $panel.find('#ow_wi_entry_list');
        $list.html('<div class="ow-empty">加载中…</div>');
        let bookNames = [];
        const charBookCount = getCharBookEntries().length;
        try {
            bookNames = getBoundWorldInfoBookNames();
        } catch (err) {
            log('error', 'system', `识别世界书失败：${err.message || err}`, err);
            $list.html('<div class="ow-empty">识别世界书时出错，详见日志标签页。</div>');
            return;
        }
        const srcLabel = [...bookNames, ...(charBookCount ? [`${CHAR_BOOK_LABEL}(${charBookCount}条)`] : [])];
        $panel.find('#ow_wi_book_names').text(srcLabel.length ? srcLabel.join('、') : '（未识别到已激活的世界书/聊天书）');
        if (!bookNames.length && !charBookCount) {
            $list.html('<div class="ow-empty">没有识别到激活的世界书，也没有绑定聊天书。<br>请先在酒馆「世界书」面板勾选要启用的世界书，或为当前聊天绑定聊天书。</div>');
            return;
        }
        let entries = [];
        try {
            entries = await fetchWorldInfoEntriesForManagement();
        } catch (err) {
            log('error', 'system', `读取世界书条目失败：${err.message || err}`, err);
            $list.html('<div class="ow-empty">读取条目失败，详见日志标签页。</div>');
            return;
        }
        log('debug', 'system', `世界书管理列表拉取到 ${entries.length} 条条目，来自 ${bookNames.length} 本书`, bookNames);
        if (!entries.length) {
            $list.html('<div class="ow-empty">识别到的世界书里没有任何条目。</div>');
            return;
        }
        const byBook = {};
        for (const e of entries) (byBook[e.book] = byBook[e.book] || []).push(e);

        let html = '';
        for (const [book, list] of Object.entries(byBook)) {
            const onCount = list.filter((e) => isWorldInfoEntrySendEnabled(s, e.book, e.uid, e.disabledInST)).length;
            const isCharBook = book === CHAR_BOOK_KEY;
            const shownName = isCharBook ? CHAR_BOOK_LABEL : book;
            html += `
            <div class="ow-widget-card" data-book="${escapeHtml(book)}">
              <div class="ow-widget-card-head">
                <i class="fa-solid ${isCharBook ? 'fa-id-card' : 'fa-book'}" style="opacity:.55;"></i>
                <span class="ow-widget-name">${escapeHtml(shownName)}</span>
                ${isCharBook ? '<span class="ow-muted ow-widget-meta">受「设置→世界书→角色卡内嵌世界书」总开关控制</span>' : ''}
                <span class="ow-muted ow-widget-meta">${onCount}/${list.length} 发送</span>
                <span class="ow-spacer"></span>
                <button class="ow-btn" data-action="wi-all" data-book="${escapeHtml(book)}">全选</button>
                <button class="ow-btn" data-action="wi-none" data-book="${escapeHtml(book)}">全不选</button>
              </div>
              <div class="ow-widget-card-body">
                ${list.map((e) => `
                  <div class="ow-preset-entry">
                    <input type="checkbox" class="ow-wi-entry-toggle" data-book="${escapeHtml(e.book)}" data-uid="${escapeHtml(e.uid)}"
                      ${isWorldInfoEntrySendEnabled(s, e.book, e.uid, e.disabledInST) ? 'checked' : ''}>
                    <label>${escapeHtml(e.label)}${e.disabledInST ? ' <span class="ow-muted">（酒馆中已禁用）</span>' : ''}</label>
                  </div>`).join('')}
              </div>
            </div>`;
        }
        $list.html(html);

        $list.off('change', '.ow-wi-entry-toggle').on('change', '.ow-wi-entry-toggle', function () {
            const book = $(this).data('book');
            const uidStr = String($(this).data('uid'));
            s.worldInfoOverrides[`${book}::${uidStr}`] = $(this).is(':checked');
            saveSettings();
            const $card = $(this).closest('.ow-widget-card');
            const total = $card.find('.ow-wi-entry-toggle').length;
            const on = $card.find('.ow-wi-entry-toggle:checked').length;
            $card.find('.ow-widget-meta').text(`${on}/${total} 发送`);
        });
        $list.off('click', '[data-action="wi-all"], [data-action="wi-none"]').on('click', '[data-action="wi-all"], [data-action="wi-none"]', function () {
            const want = $(this).data('action') === 'wi-all';
            const $card = $(this).closest('.ow-widget-card');
            $card.find('.ow-wi-entry-toggle').each(function () {
                const book = $(this).data('book');
                const uidStr = String($(this).data('uid'));
                s.worldInfoOverrides[`${book}::${uidStr}`] = want;
                $(this).prop('checked', want);
            });
            saveSettings();
            const total = $card.find('.ow-wi-entry-toggle').length;
            $card.find('.ow-widget-meta').text(`${want ? total : 0}/${total} 发送`);
        });
    }

    // ---------------- 提示词面板 ----------------
    function renderPromptsPanel($panel) {
        const s = settings();
        $panel.html(`
        <div class="ow-hint">编辑即保存。各表自己的规则写在「表格生成 → 表格管理」里，这里只放组件提示词与表格总则。</div>

        <div class="ow-group">
          <div class="ow-group-title"><i class="fa-solid fa-puzzle-piece"></i> 组件生成提示词</div>
          <div class="ow-row"><button class="ow-btn" id="ow_prompt_widget_reset">恢复默认</button></div>
          <textarea class="ow-textarea" id="ow_prompt_widget" style="min-height:200px;">${escapeHtml(s.prompts.widgetSystemPrompt)}</textarea>
        </div>

        <div class="ow-group">
          <div class="ow-group-title"><i class="fa-solid fa-table-list"></i> 表格总则</div>
          <div class="ow-row">
            <button class="ow-btn" id="ow_prompt_offscreen_reset">恢复默认</button>
            <button class="ow-btn" id="ow_prompt_preview_btn">预览完整提示词</button>
          </div>
          <textarea class="ow-textarea" id="ow_prompt_offscreen" style="min-height:220px;">${escapeHtml(s.prompts.offscreenPreamble)}</textarea>
          <pre id="ow_prompt_preview" class="ow-preview-box" style="display:none;"></pre>
        </div>

        <div class="ow-group">
          <div class="ow-group-title"><i class="fa-solid fa-code-branch"></i> 剧情推演 · 生成提示词</div>
          <div class="ow-row"><button class="ow-btn" id="ow_prompt_plot_reset">恢复默认</button></div>
          <textarea class="ow-textarea" id="ow_prompt_plot" style="min-height:240px;">${escapeHtml(s.prompts.plotSystemPrompt)}</textarea>
        </div>

        <div class="ow-group">
          <div class="ow-group-title"><i class="fa-solid fa-syringe"></i> 剧情推演 · 注入聊天提示词</div>
          <div class="ow-hint">可用占位符：<code>{{event_id}}</code> <code>{{event_title}}</code> <code>{{event_core}}</code> <code>{{event_trigger}}</code> <code>{{branches}}</code> <code>{{marker_example}}</code>。
          其中 <code>{{marker_example}}</code> 会替换成当前事件的隐藏标记样例，扩展就是靠扫描这个标记来自动置灰分支并推进的，删掉它自动推进就会失效。</div>
          <div class="ow-row"><button class="ow-btn" id="ow_prompt_plotinj_reset">恢复默认</button></div>
          <textarea class="ow-textarea" id="ow_prompt_plotinj" style="min-height:200px;">${escapeHtml(s.prompts.plotInjectTemplate)}</textarea>
        </div>`);

        $panel.find('#ow_prompt_widget').on('input', function () {
            s.prompts.widgetSystemPrompt = $(this).val();
            saveSettings();
        });
        $panel.find('#ow_prompt_widget_reset').on('click', function () {
            if (!confirm('确定恢复“组件生成提示词”为默认内容吗？当前编辑内容会被覆盖。')) return;
            s.prompts.widgetSystemPrompt = DEFAULT_WIDGET_SYSTEM_PROMPT;
            saveSettings();
            renderPromptsPanel($panel);
        });
        $panel.find('#ow_prompt_offscreen').on('input', function () {
            s.prompts.offscreenPreamble = $(this).val();
            saveSettings();
        });
        $panel.find('#ow_prompt_offscreen_reset').on('click', function () {
            if (!confirm('确定恢复“表格总则”为默认内容吗？当前编辑内容会被覆盖。')) return;
            s.prompts.offscreenPreamble = DEFAULT_OFFSCREEN_PREAMBLE;
            saveSettings();
            renderPromptsPanel($panel);
        });
        $panel.find('#ow_prompt_plot').on('input', function () { s.prompts.plotSystemPrompt = $(this).val(); saveSettings(); });
        $panel.find('#ow_prompt_plot_reset').on('click', function () {
            if (!confirm('确定恢复“剧情推演生成提示词”为默认内容吗？')) return;
            s.prompts.plotSystemPrompt = DEFAULT_PLOT_SYSTEM_PROMPT;
            saveSettings(); renderPromptsPanel($panel);
        });
        $panel.find('#ow_prompt_plotinj').on('input', function () { s.prompts.plotInjectTemplate = $(this).val(); saveSettings(); updateInjections(); });
        $panel.find('#ow_prompt_plotinj_reset').on('click', function () {
            if (!confirm('确定恢复“剧情推演注入提示词”为默认内容吗？')) return;
            s.prompts.plotInjectTemplate = DEFAULT_PLOT_INJECT_TEMPLATE;
            saveSettings(); updateInjections(); renderPromptsPanel($panel);
        });
        $panel.find('#ow_prompt_preview_btn').on('click', function () {
            const $box = $panel.find('#ow_prompt_preview');
            if ($box.is(':visible')) { $box.hide(); return; }
            $box.text(buildOffscreenSystemPrompt()).show();
        });
    }

    function renderSettingsPanel($panel) {
        const s = settings();
        const follow = s.offscreen.followWidgets;
        const posOptions = (sel) => `
            <option value="IN_PROMPT" ${sel === 'IN_PROMPT' ? 'selected' : ''}>提示词顶部</option>
            <option value="IN_CHAT" ${sel === 'IN_CHAT' ? 'selected' : ''}>聊天记录中（按深度）</option>
            <option value="BEFORE_PROMPT" ${sel === 'BEFORE_PROMPT' ? 'selected' : ''}>提示词最前</option>`;
        const html = `
        <div class="ow-group">
          <div class="ow-group-title"><i class="fa-solid fa-puzzle-piece"></i> 组件</div>

          <div class="ow-field-label">生成方式</div>
          <div class="ow-row">
            <label><input type="radio" name="ow_trigger" value="manual" ${s.triggerMode === 'manual' ? 'checked' : ''}> 手动</label>
            <label><input type="radio" name="ow_trigger" value="auto" ${s.triggerMode === 'auto' ? 'checked' : ''}> 自动</label>
          </div>
          <div class="ow-sub-fields" id="ow_auto_trigger_fields" style="${s.triggerMode === 'auto' ? '' : 'display:none;'}">
            <label><input type="checkbox" id="ow_auto_content_tag" ${s.autoTriggers.onContentTag ? 'checked' : ''}> 检测到 &lt;content&gt; 闭合标签时生成</label>
            <label><input type="checkbox" id="ow_auto_widget_floor" ${s.autoTriggers.widgetsByFloor.enabled ? 'checked' : ''}> 每
              <input type="number" class="ow-input ow-num" id="ow_auto_widget_floor_n" min="1" value="${s.autoTriggers.widgetsByFloor.interval}">楼层生成一次</label>
          </div>

          <div class="ow-field-label">上下文</div>
          <div class="ow-row">
            <label>获取最近 <input type="number" class="ow-input ow-num" id="ow_history_depth" min="0" value="${s.historyDepth}"> 楼聊天记录</label>
          </div>

          <div class="ow-field-label">注入正文</div>
          <div class="ow-row">
            <label><input type="checkbox" id="ow_inject_widgets" ${s.injectWidgets ? 'checked' : ''}> 注入组件结果</label>
            <select class="ow-select" id="ow_inject_pos">${posOptions(s.injectPosition)}</select>
            <label>深度 <input type="number" class="ow-input ow-num" id="ow_inject_depth" min="0" value="${s.injectDepth}"></label>
          </div>
        </div>

        <div class="ow-group">
          <div class="ow-group-title"><i class="fa-solid fa-table-list"></i> 表格生成</div>

          <div class="ow-row">
            <label><input type="checkbox" id="ow_off_enabled_set" ${s.offscreen.enabled ? 'checked' : ''}> 启用表格功能</label>
          </div>

          <div class="ow-field-label">生成方式</div>
          <div class="ow-row">
            <label><input type="checkbox" id="ow_off_follow" ${follow ? 'checked' : ''}> 跟随组件一起生成</label>
          </div>
          <div class="ow-sub-fields ${follow ? 'ow-disabled' : ''}" id="ow_off_own_fields">
            <label><input type="checkbox" id="ow_auto_offscreen_floor" ${s.autoTriggers.offscreenByFloor.enabled ? 'checked' : ''} ${follow ? 'disabled' : ''}> 每
              <input type="number" class="ow-input ow-num" id="ow_auto_offscreen_floor_n" min="1" value="${s.autoTriggers.offscreenByFloor.interval}" ${follow ? 'disabled' : ''}>楼层生成一次</label>
            <label>获取最近
              <input type="number" class="ow-input ow-num" id="ow_off_history_depth" min="0" value="${s.offscreen.historyDepth}" ${follow ? 'disabled' : ''}> 楼聊天记录</label>
            <div class="ow-muted ow-follow-note" style="${follow ? '' : 'display:none;'}">已跟随组件设置：楼层间隔与上下文楼层数与组件一致</div>
          </div>

          <div class="ow-field-label">注入正文</div>
          <div class="ow-row">
            <label><input type="checkbox" id="ow_off_inject" ${s.offscreen.injectTables ? 'checked' : ''}> 注入表格内容</label>
            <select class="ow-select" id="ow_off_inject_pos">${posOptions(s.offscreen.injectPosition)}</select>
            <label>深度 <input type="number" class="ow-input ow-num" id="ow_off_inject_depth" min="0" value="${s.offscreen.injectDepth}"></label>
          </div>
        </div>

        <div class="ow-group">
          <div class="ow-group-title"><i class="fa-solid fa-code-branch"></i> 剧情推演</div>
          <div class="ow-field-label">上下文</div>
          <div class="ow-row">
            <label>获取最近 <input type="number" class="ow-input ow-num" id="ow_plot_history" min="0" value="${s.plot.historyDepth}"> 楼聊天记录</label>
          </div>
          <div class="ow-row">
            <label>至少生成 <input type="number" class="ow-input ow-num" id="ow_plot_min" min="2" value="${s.plot.minEvents}"> 个事件节点</label>
          </div>
          <div class="ow-field-label">生成</div>
          <div class="ow-row">
            <label><input type="checkbox" id="ow_plot_send_current" ${s.plot.sendCurrent ? 'checked' : ''}> 生成时发送当前推演</label>
          </div>
          <div class="ow-muted" style="padding-left:2px;">关：重新生成一份全新矩阵（对当前不满意时用）。开：把现有矩阵发给模型续写（剧情已走完、想接着往下推时用）。</div>

          <div class="ow-field-label">注入正文</div>
          <div class="ow-row">
            <label><input type="checkbox" id="ow_plot_inject" ${s.plot.injectEnabled ? 'checked' : ''}> 注入当前事件与分支</label>
            <select class="ow-select" id="ow_plot_inject_pos">${posOptions(s.plot.injectPosition)}</select>
            <label>深度 <input type="number" class="ow-input ow-num" id="ow_plot_inject_depth" min="0" value="${s.plot.injectDepth}"></label>
          </div>
          <div class="ow-muted">世界书发送范围跟随下方「世界书」模块的设定。</div>
        </div>

        <div class="ow-group">
          <div class="ow-group-title"><i class="fa-solid fa-book"></i> 世界书</div>
          <div class="ow-row">
            <label><input type="checkbox" id="ow_include_wi" ${s.includeWorldInfo ? 'checked' : ''}> 随行发送世界书 / 聊天书条目</label>
          </div>
          <div class="ow-row">
            <label><input type="checkbox" id="ow_include_cb" ${s.includeCharBook ? 'checked' : ''}> 随行发送角色卡内嵌世界书</label>
          </div>
          <div class="ow-hint">具体发送哪些书、哪些条目，在「世界书」标签页里逐条开关。</div>
        </div>

        <div class="ow-group">
          <div class="ow-group-title"><i class="fa-solid fa-plug"></i> API</div>
          <div class="ow-row">
            <label><input type="radio" name="ow_api_mode" value="system" ${s.api.mode === 'system' ? 'checked' : ''}> 跟随酒馆</label>
            <label><input type="radio" name="ow_api_mode" value="custom" ${s.api.mode === 'custom' ? 'checked' : ''}> 独立 API</label>
          </div>
          <div class="ow-sub-fields" id="ow_custom_api_fields" style="${s.api.mode === 'custom' ? '' : 'display:none;'}">
            <input type="text" class="ow-input" id="ow_api_url" placeholder="URL，如 https://api.openai.com/v1" value="${escapeHtml(s.api.url)}">
            <input type="password" class="ow-input" id="ow_api_key" placeholder="API Key" value="${escapeHtml(s.api.key)}">
            <div class="ow-row">
              <select class="ow-select ow-grow" id="ow_api_model">
                ${s.api.model ? `<option value="${escapeHtml(s.api.model)}" selected>${escapeHtml(s.api.model)}</option>` : ''}
                ${(s.api.modelList || []).filter((m) => m !== s.api.model).map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('')}
              </select>
              <button class="ow-btn" id="ow_api_pull_models">拉取模型</button>
            </div>
            <div class="ow-muted">填写即保存。Key 以明文存于酒馆设置，勿在共享环境使用敏感 Key。</div>
          </div>
        </div>

        <div class="ow-group">
          <div class="ow-group-title"><i class="fa-solid fa-palette"></i> 主题</div>
          <div class="ow-row">
            <label><input type="radio" name="ow_theme_mode" value="system" ${s.theme.mode === 'system' ? 'checked' : ''}> 跟随酒馆</label>
            <label><input type="radio" name="ow_theme_mode" value="custom" ${s.theme.mode === 'custom' ? 'checked' : ''}> 自定义 CSS</label>
          </div>
          <div class="ow-sub-fields" id="ow_custom_theme_fields" style="${s.theme.mode === 'custom' ? '' : 'display:none;'}">
            <textarea class="ow-textarea" id="ow_theme_css" style="min-height:90px;" placeholder=".ow-modal { }">${escapeHtml(s.theme.customCss)}</textarea>
            <div class="ow-row"><button class="ow-btn ow-primary" id="ow_theme_save">保存并应用</button></div>
          </div>
        </div>

        <div class="ow-group">
          <div class="ow-group-title"><i class="fa-solid fa-circle-info"></i> 关于 / 更新</div>
          <div class="ow-row">
            <span class="ow-muted">Ego 小助手 v${EXT_VERSION}</span>
          </div>
          <div class="ow-row">
            <a href="${REPO_URL.replace(/\.git$/, '')}" target="_blank" rel="noopener noreferrer" class="ow-btn" style="text-decoration:none;">
              <i class="fa-brands fa-github"></i> 仓库
            </a>
            <button class="ow-btn" id="ow_check_update"><i class="fa-solid fa-rotate"></i> 检查更新</button>
            <button class="ow-btn" id="ow_open_ext_manager"><i class="fa-solid fa-gear"></i> 打开扩展管理器</button>
            <button class="ow-btn" id="ow_diag_geometry"><i class="fa-solid fa-ruler-combined"></i> 界面显示诊断</button>
          </div>
          <div id="ow_update_status" class="ow-hint">尚未检查</div>
        </div>
        `;
        $panel.html(html);
        renderUpdateSection($panel);

        $panel.find('#ow_check_update').on('click', async function () {
            const $btn = $(this);
            $btn.prop('disabled', true);
            $panel.find('#ow_update_status').text('检查中…');
            await checkExtensionUpdate();
            $btn.prop('disabled', false);
            renderUpdateSection($panel);
            if ($modal) renderUpdateBanner($modal);
        });

        $panel.find('input[name="ow_trigger"]').on('change', function () {
            s.triggerMode = $(this).val();
            saveSettings();
            $panel.find('#ow_auto_trigger_fields').toggle(s.triggerMode === 'auto');
        });
        $panel.find('#ow_auto_content_tag').on('change', function () { s.autoTriggers.onContentTag = $(this).is(':checked'); saveSettings(); });
        $panel.find('#ow_auto_widget_floor').on('change', function () { s.autoTriggers.widgetsByFloor.enabled = $(this).is(':checked'); saveSettings(); });
        $panel.find('#ow_auto_widget_floor_n').on('change', function () { s.autoTriggers.widgetsByFloor.interval = Math.max(1, Number($(this).val()) || 1); saveSettings(); });
        $panel.find('#ow_off_enabled_set').on('change', function () {
            s.offscreen.enabled = $(this).is(':checked');
            saveSettings();
            if ($modal) renderOffscreenPanel($modal.find('.ow-panel[data-panel="offscreen"]'));
        });
        $panel.find('#ow_off_follow').on('change', function () {
            s.offscreen.followWidgets = $(this).is(':checked');
            saveSettings();
            const on = s.offscreen.followWidgets;
            const $f = $panel.find('#ow_off_own_fields');
            $f.toggleClass('ow-disabled', on);
            $f.find('input').prop('disabled', on);
            $f.find('.ow-follow-note').toggle(on);
        });
        $panel.find('#ow_off_history_depth').on('change', function () { s.offscreen.historyDepth = Math.max(0, Number($(this).val()) || 0); saveSettings(); });
        $panel.find('#ow_diag_geometry').on('click', function () {
            forceOverlayGeometry($modal);
            diagnoseModalGeometry();
            toast('已复位窗口并记录几何诊断，详见「日志」标签页', 'info');
        });
        $panel.find('#ow_plot_history').on('change', function () { s.plot.historyDepth = Math.max(0, Number($(this).val()) || 0); saveSettings(); });
        $panel.find('#ow_plot_min').on('change', function () { s.plot.minEvents = Math.max(2, Number($(this).val()) || 2); saveSettings(); });
        $panel.find('#ow_plot_send_current').on('change', function () { s.plot.sendCurrent = $(this).is(':checked'); saveSettings(); });
        $panel.find('#ow_plot_inject').on('change', function () { s.plot.injectEnabled = $(this).is(':checked'); saveSettings(); updateInjections(); });
        $panel.find('#ow_plot_inject_pos').on('change', function () { s.plot.injectPosition = $(this).val(); saveSettings(); updateInjections(); });
        $panel.find('#ow_plot_inject_depth').on('change', function () { s.plot.injectDepth = Number($(this).val()) || 0; saveSettings(); updateInjections(); });
        $panel.find('#ow_open_ext_manager').on('click', function () {
            // 尝试打开酒馆自带的扩展管理器（不同版本入口 id 略有差异，逐个尝试）
            const candidates = ['#extensionsMenuButton', '#extensions_button', '#rm_extensions_block', '#extensions_details'];
            for (const sel of candidates) {
                const $el = $(sel);
                if ($el.length) { $el.trigger('click'); toast('已尝试打开酒馆扩展管理器', 'info'); return; }
            }
            toast('没找到扩展管理器入口，请手动打开酒馆左侧「扩展」面板 → Manage extensions', 'warning');
        });
        $panel.find('#ow_auto_offscreen_floor').on('change', function () { s.autoTriggers.offscreenByFloor.enabled = $(this).is(':checked'); saveSettings(); });
        $panel.find('#ow_auto_offscreen_floor_n').on('change', function () { s.autoTriggers.offscreenByFloor.interval = Math.max(1, Number($(this).val()) || 1); saveSettings(); });
        $panel.find('#ow_history_depth').on('change', function () { s.historyDepth = Math.max(0, Number($(this).val()) || 0); saveSettings(); });
        $panel.find('#ow_include_wi').on('change', function () { s.includeWorldInfo = $(this).is(':checked'); saveSettings(); });
        $panel.find('#ow_include_cb').on('change', function () { s.includeCharBook = $(this).is(':checked'); saveSettings(); });

        $panel.find('#ow_inject_widgets').on('change', function () { s.injectWidgets = $(this).is(':checked'); saveSettings(); updateInjections(); });
        $panel.find('#ow_inject_pos').on('change', function () { s.injectPosition = $(this).val(); saveSettings(); updateInjections(); });
        $panel.find('#ow_inject_depth').on('change', function () { s.injectDepth = Number($(this).val()) || 0; saveSettings(); updateInjections(); });

        $panel.find('#ow_off_inject').on('change', function () { s.offscreen.injectTables = $(this).is(':checked'); saveSettings(); updateInjections(); });
        $panel.find('#ow_off_inject_pos').on('change', function () { s.offscreen.injectPosition = $(this).val(); saveSettings(); updateInjections(); });
        $panel.find('#ow_off_inject_depth').on('change', function () { s.offscreen.injectDepth = Number($(this).val()) || 0; saveSettings(); updateInjections(); });

        $panel.find('input[name="ow_api_mode"]').on('change', function () {
            s.api.mode = $(this).val();
            saveSettings();
            $panel.find('#ow_custom_api_fields').toggle(s.api.mode === 'custom');
        });
        $panel.find('#ow_api_url').on('input', function () { s.api.url = $(this).val().trim(); saveSettings(); log('debug', 'system', 'API URL 已自动保存'); });
        $panel.find('#ow_api_key').on('input', function () { s.api.key = $(this).val(); saveSettings(); log('debug', 'system', 'API Key 已自动保存'); });
        $panel.find('#ow_api_model').on('change', function () { s.api.model = $(this).val(); saveSettings(); log('debug', 'system', `API 模型已自动保存为 ${s.api.model}`); });
        $panel.find('#ow_api_pull_models').on('click', async function () {
            if (!s.api.url) { toast('请先填写 API URL', 'warning'); return; }
            const $btn = $(this);
            $btn.prop('disabled', true).text('拉取中…');
            try {
                const list = await fetchCustomModelList();
                toast(`拉取到 ${list.length} 个模型`, 'success');
                renderSettingsPanel($panel);
            } catch (err) {
                console.error(err);
                toast(`拉取失败：${err.message || err}`, 'error');
            } finally {
                $btn.prop('disabled', false).text('拉取模型列表');
            }
        });

        $panel.find('input[name="ow_theme_mode"]').on('change', function () {
            s.theme.mode = $(this).val();
            saveSettings();
            $panel.find('#ow_custom_theme_fields').toggle(s.theme.mode === 'custom');
            applyTheme();
        });
        $panel.find('#ow_theme_save').on('click', function () {
            s.theme.customCss = $panel.find('#ow_theme_css').val();
            saveSettings();
            applyTheme();
            toast('主题已应用', 'success');
        });
    }

    // ------------------------------------------------------------------
    // 入口：仅在输入框旁的“魔法棒”扩展菜单中添加一个入口
    // ------------------------------------------------------------------
    function addMenuButton() {
        if ($('#ow_menu_button').length) return;
        const $btn = $(`
          <div id="ow_menu_button" class="list-group-item flex-container flexGap5 interactable" tabindex="0">
            <i class="fa-solid fa-clapperboard"></i>
            <span>Ego 小助手</span>
            <span id="ow_menu_update_badge" class="ow-log-badge" style="display:none;" title="有新版本可更新">NEW</span>
          </div>`);
        $('#extensionsMenu').append($btn);
        $btn.on('click', openModal);
        updateMenuBadge();
    }

    function waitForMenu(retries = 30) {
        if ($('#extensionsMenu').length) { addMenuButton(); return; }
        if (retries <= 0) { console.warn('[Ego] 未找到 #extensionsMenu，扩展入口未挂载'); return; }
        setTimeout(() => waitForMenu(retries - 1), 500);
    }

    // ------------------------------------------------------------------
    // 初始化
    // ------------------------------------------------------------------
    jQuery(async () => {
        try {
            settings(); // 确保设置结构存在
            waitForMenu();
            const c = ctx();
            c.eventSource.on(c.eventTypes.CHARACTER_MESSAGE_RENDERED, onCharacterMessageRendered);
            c.eventSource.on(c.eventTypes.CHAT_CHANGED, () => {
                log('debug', 'system', '检测到 CHAT_CHANGED，刷新已打开的面板');
                refreshOpenPanels();
            });
            log('info', 'system', '扩展初始化完成');
            checkExtensionUpdate({ quiet: true }); // 静默检查一次，让菜单角标能在不打开弹窗时也生效
        } catch (err) {
            log('error', 'system', '初始化失败', err);
        }
    });
})();
