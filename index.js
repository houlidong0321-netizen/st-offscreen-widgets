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

    // 更新检查：扩展以 ES module 加载，document.currentScript 恒为 null，
    // 因此用 import.meta.url 推导安装目录名，喂给酒馆的 /api/extensions/version|update。
    const EXT_NAME = 'Ego 小助手';
    const EXT_VERSION = '2.9.1';
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
    // 与酒馆世界书的位置语义对齐：
    //   角色定义前 = BEFORE_PROMPT（getExtensionPrompt 里的 beforeScenarioAnchor）
    //   角色定义后 = IN_PROMPT   （afterScenarioAnchor）
    //   聊天中     = IN_CHAT     （按 depth 插入聊天记录）
    // 注意：酒馆对"角色定义前/后"的多条注入是按注入键名 Object.keys().sort() 排序的，
    // depth 只对"聊天中"生效。所以"顺序"必须编码进键名里（补零后参与字典序）。
    const PROMPT_TYPES = { IN_PROMPT: 0, IN_CHAT: 1, BEFORE_PROMPT: 2 };
    // 注入统一使用"聊天中 + 深度"。
    // 另外两个插槽（anchorBefore/anchorAfter）在酒馆默认上下文模板里根本没有对应变量，
    // 注入进去不会被渲染，因此不提供。
    const INJECT_POSITION = PROMPT_TYPES.IN_CHAT;

    // 已注册的注入键，用于在重新注入前清干净（键名会随顺序变化）
    const registeredInjectKeys = new Set();

    /**
     * 注册一条注入。
     * @param {string} baseName 模块标识
     * @param {string} position 'BEFORE_PROMPT' | 'IN_PROMPT' | 'IN_CHAT'
     * @param {number} depth    仅"聊天中"生效
     * @param {number} order    仅"角色定义前/后"生效，数字越小越靠前
     */
    function setInjection(baseName, text, depth) {
        const c = ctx();
        const key = `${MODULE_NAME}_${baseName}`;
        registeredInjectKeys.add(key);
        c.setExtensionPrompt(key, text || '', INJECT_POSITION, Number(depth) || 0);
    }

    function clearAllInjections() {
        const c = ctx();
        for (const k of registeredInjectKeys) c.setExtensionPrompt(k, '', PROMPT_TYPES.IN_PROMPT, 0);
        registeredInjectKeys.clear();
    }
    const INJECT_KEY_WIDGETS = `${MODULE_NAME}_widgets`;
    const INJECT_KEY_OFFSCREEN = `${MODULE_NAME}_offscreen`;
    const INJECT_KEY_PLOT = `${MODULE_NAME}_plot`;
    const INJECT_KEY_SUMMARY = `${MODULE_NAME}_summary`;
    const INJECT_KEY_LORE = `${MODULE_NAME}_lore`;

    // 日志：只存内存（刷新即清空），出问题时可复制给开发者排查。
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
        includeWorldInfo: false,
        injectWidgets: false,
        injectDepth: 0,
        offscreen: {
            enabled: false,
            triggerMode: 'manual',  // 'manual' | 'auto'
            autoMode: 'follow',     // 'follow'=跟随组件 | 'floor'=自选楼层间隔
            floorInterval: 10,      // autoMode='floor' 时生效
            historyDepth: 5,        // autoMode='follow' 时跟随组件的设置
            injectTables: false,
                injectDepth: 0,
        },
        api: { mode: 'system', url: '', key: '', model: '', modelList: [], presets: [], activePresetId: '' },
        // 各模块用哪套 API：'system'=跟随酒馆，'preset'=指定预设
        moduleApi: {
            widgets: { mode: 'system', presetId: '' },
            tables:  { mode: 'system', presetId: '' },
            plot:    { mode: 'system', presetId: '' },
            summary: { mode: 'system', presetId: '' },
        },
        theme: { mode: 'system', customCss: '' },
        prompts: {
            widgetSystemPrompt: DEFAULT_WIDGET_SYSTEM_PROMPT,
            offscreenPreamble: DEFAULT_OFFSCREEN_PREAMBLE,
            plotSystemPrompt: DEFAULT_PLOT_SYSTEM_PROMPT,
            plotInjectTemplate: DEFAULT_PLOT_INJECT_TEMPLATE,
            summarySystemPrompt: DEFAULT_SUMMARY_SYSTEM_PROMPT,
            summaryCompressPrompt: DEFAULT_SUMMARY_COMPRESS_PROMPT,
        },
        offscreenTables: defaultOffscreenTables(),
        // 收藏夹：跨聊天全局保存，folders 为文件夹，items 为收藏的组件快照
        favorites: { folders: [{ id: 'default', name: '默认收藏夹', createdAt: Date.now() }], items: [] },
        // 本聊天专属设定（只在当前聊天生效，不会污染角色卡世界书）
        lore: {
            injectEnabled: true,
            scanDepth: 10,   // 关键词触发时向前扫描多少层聊天
        },
        // 总结
        summary: {
            enabled: false,
            countMode: 'floor',   // 'floor'=按楼层（消息ID） | 'chapter'=按正文里的 [Chapter_X] 标签
            // 识别正文里"现成摘要"的规则（可自行增删/改写正则）
            detectPatterns: [
                { id: 'abstract', name: '<abstract_format>…</abstract_format>', pattern: '<abstract_format>([\\s\\S]*?)</abstract_format>', enabled: true },
                { id: 'chapterline', name: '以 `[Chapter_X]` 开头的整行/整段', pattern: '(`\\[Chapter_\\d+\\]`[\\s\\S]*?)(?:\\n\\s*\\n|$)', enabled: true },
                { id: 'details', name: '<details><summary>摘要</summary>…</details>', pattern: '<details>\\s*<summary>\\s*(?:摘要|总结|Summary)\\s*</summary>([\\s\\S]*?)</details>', enabled: true },
                { id: 'tag', name: '<摘要>…</摘要>', pattern: '<\\s*(?:摘要|summary)\\s*>([\\s\\S]*?)<\\s*/\\s*(?:摘要|summary)\\s*>', enabled: true },
                { id: 'bracket', name: '【摘要】…（到段落末）', pattern: '【\\s*(?:摘要|总结)\\s*】\\s*([\\s\\S]*?)(?:\\n\\s*\\n|$)', enabled: true },
            ],
            onMissing: 'generate',   // 'generate' = 让模型补写并标记⚠️ | 'skip' = 跳过并列出章号
            compressMode: 'manual',  // 'manual' | 'auto'
            compressLag: 5,          // 自动：出现第 N 次总结时压缩第 1 次，第 N+1 次时压缩第 2 次…
            injectEnabled: false,
                injectDepth: 2,
        },
        // 剧情推演
        plot: {
            customEvents: '',
            historyDepth: 20,
            minEvents: 10,
            injectEnabled: true,
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
            // 楼层自动触发时，回避最新的这几层不读——酒馆可以重 roll，
            // 刚出的那条很可能被重写，读进去就白读了，留一轮余地。
            floorBackoff: 2,
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
        const st = es[MODULE_NAME];
        // 迁移：旧版只有一套独立 API，转成预设列表里的第一条
        if (st.api && !Array.isArray(st.api.presets)) st.api.presets = [];
        if (st.api && st.api.url && !st.api.presets.length) {
            const id = `api_${Date.now().toString(36)}`;
            st.api.presets.push({ id, name: '默认 API', url: st.api.url, key: st.api.key || '', model: st.api.model || '', modelList: st.api.modelList || [] });
            st.api.activePresetId = id;
            if (st.api.mode === 'custom') {
                for (const k of ['widgets', 'tables', 'plot', 'summary']) {
                    if (st.moduleApi?.[k]) { st.moduleApi[k].mode = 'preset'; st.moduleApi[k].presetId = id; }
                }
            }
        }
        // 迁移：表格触发从 followWidgets + autoTriggers.offscreenByFloor 改为独立的 triggerMode/autoMode
        if (st.offscreen && st.offscreen.followWidgets !== undefined) {
            const oldFloor = st.autoTriggers?.offscreenByFloor;
            if (st.offscreen.followWidgets) {
                st.offscreen.triggerMode = 'auto';
                st.offscreen.autoMode = 'follow';
            } else if (oldFloor?.enabled) {
                st.offscreen.triggerMode = 'auto';
                st.offscreen.autoMode = 'floor';
                st.offscreen.floorInterval = oldFloor.interval || 10;
            } else {
                st.offscreen.triggerMode = 'manual';
            }
            delete st.offscreen.followWidgets;
            if (st.autoTriggers) delete st.autoTriggers.offscreenByFloor;
        }
        // 迁移：旧版本的发展方向只有 {id,name,enabled}，没有 prompt 字段。
        // deepMergeDefaults 不会深入数组元素，这里按 id 补上内置方向的默认提示词。
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
        // 本聊天专属设定
        if (!c.chatMetadata[MODULE_NAME].lore) {
            c.chatMetadata[MODULE_NAME].lore = { entries: [] };
        }
        if (!Array.isArray(c.chatMetadata[MODULE_NAME].lore.entries)) c.chatMetadata[MODULE_NAME].lore.entries = [];
        // 总结状态
        if (!c.chatMetadata[MODULE_NAME].summary) {
            c.chatMetadata[MODULE_NAME].summary = { index: [], bigSummaries: [], hidden: [], scannedAt: null };
        }
        const sm = c.chatMetadata[MODULE_NAME].summary;
        if (!Array.isArray(sm.index)) sm.index = [];
        if (!Array.isArray(sm.bigSummaries)) sm.bigSummaries = [];
        if (!Array.isArray(sm.hidden)) sm.hidden = [];
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

    /** 立即落盘（不走防抖）。在可能触发酒馆重载/保存聊天的操作前后调用，防止未保存数据被冲掉。 */
    async function flushChatData() {
        try {
            const c = ctx();
            if (typeof c.saveMetadata === 'function') { await c.saveMetadata(); return true; }
        } catch (err) {
            log('warn', 'system', `强制保存扩展数据失败：${err.message || err}`);
        }
        return false;
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

    // 本聊天专属设定：存在 chatMetadata，只对当前聊天生效，不影响角色卡世界书。
    const LORE_TYPES = [
        { id: 'setting', name: '世界设定' },
        { id: 'npc', name: 'NPC' },
        { id: 'persona', name: '用户人设' },
        { id: 'other', name: '其他' },
    ];

    function loreTypeName(id) {
        return LORE_TYPES.find((t) => t.id === id)?.name || '其他';
    }

    function loreEntries() {
        return chatData().lore.entries;
    }

    /** 关键词触发：留空=常驻注入；填了=最近若干层聊天里出现才注入 */
    function isLoreEntryActive(entry, recentText) {
        if (entry.enabled === false) return false;
        const kws = String(entry.keywords || '').split(/[,，;；\n]/).map((x) => x.trim()).filter(Boolean);
        if (!kws.length) return true;
        return kws.some((k) => recentText.includes(k));
    }

    /**
     * 按注入位置把生效的设定条目分组。
     * 每条可以单独指定位置/深度（像世界书那样），没指定的用模块默认值。
     * 返回 [{position, depth, text}]
     */
    function buildLoreInjectionGroups() {
        const s = settings();
        const list = loreEntries();
        if (!list.length) return [];
        const chat = ctx().chat || [];
        const depth = Math.max(1, Number(s.lore.scanDepth) || 10);
        const recentText = chat.slice(-depth).map((m) => String(m.mes || '')).join('\n');

        const active = list.filter((e) => isLoreEntryActive(e, recentText));
        const skipped = list.length - active.length;
        if (skipped > 0) log('debug', 'inject', `本聊天设定：生效 ${active.length} 条，${skipped} 条因未启用或关键词未命中而跳过`);
        if (!active.length) return [];

        const groups = new Map();
        for (const e of active) {
            const dep = Number(e.depth) || 0;
            if (!groups.has(dep)) groups.set(dep, { depth: dep, items: [] });
            groups.get(dep).items.push(e);
        }
        return [...groups.values()].map((g) => {
            const byType = {};
            for (const e of g.items) (byType[e.type || 'other'] = byType[e.type || 'other'] || []).push(e);
            const parts = [];
            for (const t of LORE_TYPES) {
                const arr = byType[t.id];
                if (!arr?.length) continue;
                parts.push(`【${t.name}】\n` + arr.map((e) => `· ${e.name}：${e.content}`).join('\n'));
            }
            return { depth: g.depth, text: parts.join('\n\n') };
        }).filter((g) => g.text).sort((a, b) => a.depth - b.depth);
    }

    /** 合并成一段纯文本（注入总览用） */
    function buildLoreInjectionText() {
        return buildLoreInjectionGroups().map((g) => g.text).join('\n\n');
    }

    // 总结模块：模型按模板直接产出完整档案文本，扩展原样保存，可重新生成 / 压缩 / 还原。

    /**
     * 计数单元。两种模式：
     *  floor   —— 按楼层（消息 ID，与 /hide 一致）。包含被隐藏的消息，
     *             否则隐藏已总结的旧楼层后，总数会缩水到比"已总结"还小，就再也总结不了了。
     *  chapter —— 按正文里的 `[Chapter_X]` 标签，取每条消息中最后出现的那个编号。
     */
    function parseChapterTag(text) {
        const re = /`?\[\s*Chapter[_\s]*(\d+)\s*\]`?/gi;
        let m, last = null;
        while ((m = re.exec(String(text || '')))) last = Number(m[1]);
        return last;
    }

    function countMode() {
        return settings().summary.countMode === 'chapter' ? 'chapter' : 'floor';
    }
    function unitName() {
        return countMode() === 'chapter' ? '章' : '楼';
    }

    /** 返回 [{chapter, msgId, mes}]；chapter 在 floor 模式下即消息 ID */
    function listChapters() {
        const chat = ctx().chat || [];
        const mode = countMode();
        const out = [];
        chat.forEach((m, i) => {
            const mes = String(m.mes || '');
            if (mode === 'floor') {
                // 不过滤 is_system：隐藏的楼层依然占楼层号
                out.push({ chapter: i, msgId: i, mes });
            } else {
                if (m.is_user) return;
                const tag = parseChapterTag(mes);
                if (tag != null) out.push({ chapter: tag, msgId: i, mes });
            }
        });
        return out.sort((a, b) => a.chapter - b.chapter);
    }

    /** 当前最大计数单元号 */
    function maxChapter() {
        const list = listChapters();
        return list.length ? list[list.length - 1].chapter : 0;
    }

    /** 已被大总结覆盖到的最大章号 */    /** 已被大总结覆盖到的最大章号 */
    /** 已被大总结覆盖到的最大章号 */
    /**
     * 已总结到的最大编号。返回 null 表示"还没总结过任何内容"。
     * 不能用 0 代表"没总结过"——楼层模式是 0 起算的，那样会漏掉第 0 楼。
     */
    function lastSummarizedChapter() {
        const list = chatData().summary.bigSummaries;
        if (!list.length) return null;
        return list.reduce((mx, b) => Math.max(mx, Number(b.toCh) || 0), 0);
    }

    /** 下一次总结应当从哪个编号开始 */
    function nextSummaryStart() {
        const last = lastSummarizedChapter();
        if (last !== null) return last + 1;
        // 没总结过：楼层模式从 0 起，章节模式从最小的章号起
        if (countMode() === 'floor') return 0;
        const list = listChapters();
        return list.length ? list[0].chapter : 1;
    }

    const DEFAULT_SUMMARY_SYSTEM_PROMPT = `你是一个剧情档案编排器。你的任务是把已有的各章摘要**原样搬运**并按场景重新编排，不是重新撰写。

【核心硬性约束：纯粹的搬运工与时间线守护者】
1. 绝对的无损复制：所谓"摘要"，100% 特指每一章正文里**已经生成好的现成摘要**（末尾/开头的摘要块）。
2. 严禁重构与打乱顺序：绝对禁止再去读正文自行总结新摘要（除非该章确实没有现成摘要）。
   绝对禁止改变章节原本的先后顺序，必须严格按第1章、第2章、第3章的线性顺序搬运。若原摘要为外语，直译为中文后再搬运。
3. 严禁遗漏：范围内每一章的现成摘要都必须出现在结果里。

【第一步：线性摘要搬运与场景锚点定标】
- 逐章检索，按时间顺序排列。
- 只有剧情发生**物理空间转移**时（如从A房间到B房间），才在列表前方插入一个【转场标题】，包含场景名称与时间。
- 在转场标题下方，无损搬运该场景下发生的所有现成摘要。
- 若下方给出了【已有场景标签】，同一地点必须复用其 \`[Scene_X]\` 标签。

【第二步：高光剧本提取】
- 针对每个转场区间，回到正文原文中寻找最具张力或推动力的连续互动。
- **一行 = 一个角色的一句台词 + 一个短动作**，严格照这个样子写：
      安琳："上车。" (转身时，深褐色的皮草边缘在潮湿的空气中划出一道沉闷的弧度。)
      况野："好姐姐，你走慢点，小狗没打伞，又要淋湿了。" (换上一副没皮没脸的笑，语调黏糊，三两步追上。)
- **只输出 3-5 行**（是 3-5 行台词，不是 3-5 段正文）。剧情需连续，一个区间仅限一段。
- **对白**：角色说出口的那一句，逐字原文，不许改写、不许合并两句。
- **动作**：只写说这句话那一瞬间的肢体/表情/语气，从原文摘取最贴近的短句，**40 字以内**。
- **严禁**把整段正文、整章内容、旁白或多句台词塞进一行；严禁把该区间所有台词堆在一起。
  括号里出现两个以上句号，或明显是成段的场景描写，都属于错误。
- 反例（禁止这样写）：
      ✗ 安琳："上车。" (雨下得很大。况野站在原地没有动。他想起三年前的那个晚上……整段正文照抄)
      ✗ 安琳："上车。你怎么还不走？我说了多少次了？" ← 多句合并
- 若该区间没有值得记录的高光互动，写"无"——宁缺毋滥。

【第三步：关键物理实体影响】
- 每个转场区间，总结产生且对后续有影响的【不可忽略物理因素】（信物、伤口等），过于日常的省略。
- 必须是正文明确提到的，禁止想象。写清来源、当前存在位置；若为伤情注明好转/消失时间节点。
- 若下方给出了【已有物品标签】，同一物品必须复用其 \`[Item_Anchor_X]\` 标签。没有则写"无"。

【第四步：锚点关联代码化】
- 用 \`[Dialogue_Anchor_X]\`、\`[Item_Anchor_X]\` 标签，与第一步中具体的【第X章摘要】双向绑定，
  使得日后提及某个锚点时能立刻知道它发生在哪一章的情境中。

【输出格式模板（严格按此结构输出，不要用代码块包裹，不要加任何解释）】
<大总结(第X-Y章)>

- 【转场标题一】：（具体地点名称） - 时间：（具体日期和时间段）
  - 核心锚点：
    - 高光对话 \`[Dialogue_Anchor_1]\`：
        角色A："{对白正文摘抄}" ({动作正文摘抄})
        角色B："{对白正文摘抄}" ({动作正文摘抄})
    - 不可忽略物理因素 \`[Item_Anchor_1]\`：1. {物品名称}（{来源说明}，置于{当前位置}，若为伤情注明好转/消失时间节点）
  - 线性摘要搬运记录：
    - \`[Chapter_A]\`：{原版现成摘要内容，非中文请翻译} (关联锚点：\`[Dialogue_Anchor_1]\`、\`[Item_Anchor_1]\`)
    - \`[Chapter_B]\`：{原版现成摘要内容}

- 【转场标题二】：（新地点名称） - 时间：（时间段）
  - 核心锚点：
    - 高光对话 \`[Dialogue_Anchor_2]\`：
        ……
    - 不可忽略物理因素：无
  - 线性摘要搬运记录：
    - \`[Chapter_C]\`：{原版现成摘要内容} (关联锚点：\`[Dialogue_Anchor_2]\`)

</大总结(第X-Y章)>`;

    const DEFAULT_SUMMARY_COMPRESS_PROMPT = `你要压缩一份剧情档案里的**叙述部分**。

【绝对禁止触碰的内容】
- 高光对话（逐字原文）与物理锚点：**一个字都不许改**。它们不在你的输入里，也不需要你处理。
【你要做的】
- 下面给出同一个转场区间内的多条章节摘要。把它们合并压缩成**一段连贯叙述**。
- 保留：人物动机的转折、关系变化、做出的决定与承诺、造成后续影响的事件。
- 可以舍弃：环境描写、重复的情绪铺陈、无后续影响的日常细节。
- 长度控制在原文的三分之一以内，但宁可长一点也不要丢掉上面要求保留的内容。
只输出压缩后的叙述文字本身，不要加标题、不要解释、不要用代码块包裹。`;

    function buildSummaryUserPrompt(fromCh, toCh) {
        const cd = chatData();
        const chapters = listChapters();
        const idxByCh = new Map(cd.summary.index.map((x) => [x.chapter, x]));
        // 用索引里的 msgId 回原文，这样章号即使不等于出场顺序也能对上
        const chat = ctx().chat || [];
        const inRange = cd.summary.index
            .filter((x) => x.chapter >= fromCh && x.chapter <= toCh)
            .map((x) => ({ chapter: x.chapter, mes: x.msgId != null ? String(chat[x.msgId]?.mes || '') : '' }));
        const parts = [];

        const scenes = (chatData().offscreen.tables?.sceneTable || [])
            .map((r) => `${r.tag} ${r.name}`).filter((x) => x.trim());
        const items = (chatData().offscreen.tables?.itemAnchorTable || [])
            .map((r) => `${r.tag} ${r.name}`).filter((x) => x.trim());
        if (scenes.length) parts.push(`【已有场景标签（同一地点必须复用）】\n${scenes.join('\n')}`);
        if (items.length) parts.push(`【已有物品标签（同一物品必须复用）】\n${items.join('\n')}`);

        parts.push(`【本次编排范围】第 ${fromCh} 章 至 第 ${toCh} 章`);
        const sumList = inRange.map((c) => {
            const rec = idxByCh.get(c.chapter);
            const tag = rec?.source === 'native' ? '' : (rec?.source === 'generated' ? '（补写）' : '（缺失）');
            return `第${c.chapter}章${tag}：${rec?.text ? rec.text.slice(0, 300) : '（无摘要）'}`;
        }).join('\n');
        parts.push(`【各章摘要一览（仅供你理解剧情走向，不要复述、不要输出它们）】\n${sumList}`);

        const raw = inRange.map((c) => `===== 第${c.chapter}章 正文 =====\n${c.mes.slice(0, 6000)}`).join('\n\n');
        parts.push(`【正文原文（用于提取高光对话，必须逐字摘抄）】\n${raw}`);
        return parts.join('\n\n');
    }

    function buildSummaryUserPromptV2(fromCh, toCh) {
        const parts = [];
        const scenes = (chatData().offscreen.tables?.sceneTable || [])
            .map((r) => `${r.tag} ${r.name}`).filter((x) => x.trim());
        const items = (chatData().offscreen.tables?.itemAnchorTable || [])
            .map((r) => `${r.tag} ${r.name}`).filter((x) => x.trim());
        if (scenes.length) parts.push(`【已有场景标签（同一地点必须复用）】\n${scenes.join('\n')}`);
        if (items.length) parts.push(`【已有物品标签（同一物品必须复用）】\n${items.join('\n')}`);
        const u = unitName();
        parts.push(`【本次整理范围】第 ${fromCh} ${u} 至 第 ${toCh} ${u}`);

        const chapters = listChapters().filter((c) => c.chapter >= fromCh && c.chapter <= toCh);
        const raw = chapters.map((c) => `===== 第${c.chapter}${u} =====\n${c.mes.slice(0, 8000)}`).join('\n\n');
        parts.push(`【各章原文（含每章末尾已生成的现成摘要，请直接搬运那些摘要，不要重写）】\n${raw}`);
        return parts.join('\n\n');
    }

    async function generateBigSummary() {
        const s = settings();
        const cd = chatData();
        const u = unitName();
        const from = nextSummaryStart();
        const to = maxChapter();
        if (to < from) throw new Error(`没有新内容可总结（已总结到第 ${from - 1} ${u}，当前最大为第 ${to} ${u}）`);

        log('info', 'system', `开始整理大总结：第 ${from}–${to} ${u}（计数方式：${countMode() === 'chapter' ? '按章节标签' : '按楼层'}）`);
        const raw = await callModel(s.prompts.summarySystemPrompt, buildSummaryUserPromptV2(from, to), `大总结 ${from}-${to}`, 'summary');
        const text = stripCodeFence(raw).trim();
        if (!text) throw new Error('模型返回为空，本次未写入。');

        const big = {
            id: `sum_${Date.now().toString(36)}`,
            fromCh: from, toCh: to,
            createdAt: Date.now(),
            imported: false,
            rawText: text,
            sections: [],
            level: 1,
            compressedAt: null,
        };
        cd.summary.bigSummaries.push(big);
        cd.summary.bigSummaries.sort((a, b) => a.fromCh - b.fromCh);
        saveChatData();
        updateInjections();
        log('info', 'system', `大总结完成：第 ${from}–${to} ${u}，${text.length} 字`);
        await flushChatData();
        if (s.summary.compressMode === 'auto') maybeAutoCompress();
        return big;
    }

    /** 重新生成某条大总结（章号范围不变，覆盖原内容） */
    async function regenerateBigSummary(bigId) {
        const s = settings();
        const cd = chatData();
        const big = cd.summary.bigSummaries.find((b) => b.id === bigId);
        if (!big) throw new Error('找不到这条总结');
        log('info', 'system', `重新生成大总结：第 ${big.fromCh}–${big.toCh} 章`);
        const raw = await callModel(s.prompts.summarySystemPrompt, buildSummaryUserPromptV2(big.fromCh, big.toCh), `重生成 ${big.fromCh}-${big.toCh}`, 'summary');
        const text = stripCodeFence(raw).trim();
        if (!text) throw new Error('模型返回为空，原内容保持不变。');
        big.rawText = text;
        big.imported = false;
        big.level = 1;
        big.compressedAt = null;
        delete big.compressedText;
        big.createdAt = Date.now();
        saveChatData();
        updateInjections();
        log('info', 'system', `已重新生成第 ${big.fromCh}–${big.toCh} 章的大总结`);
        await flushChatData();
        return big;
    }

    /** 自动压缩：出现第 N 次总结时压缩第 1 次    /** 自动压缩：出现第 N 次总结时压缩第 1 次，第 N+1 次时压缩第 2 次…（滑窗差值） */
    function maybeAutoCompress() {
        const s = settings();
        const cd = chatData();
        const lag = Math.max(1, Number(s.summary.compressLag) || 5);
        const total = cd.summary.bigSummaries.length;
        const targetIdx = total - lag; // 0 起算
        if (targetIdx < 0) return;
        const target = cd.summary.bigSummaries[targetIdx];
        if (!target || target.level >= 2) return;
        log('info', 'system', `自动压缩触发：当前共 ${total} 次总结，差值 ${lag} → 压缩第 ${targetIdx + 1} 次（第 ${target.fromCh}–${target.toCh} 章）`);
        startBackgroundTask(`压缩总结 ${target.fromCh}-${target.toCh}`, () => compressBigSummary(target.id));
    }

    /** 单条压缩：只压该次总结里各区间的叙述，高光与物理锚点原样不动 */
    async function compressBigSummary(bigId) {
        const s = settings();
        const cd = chatData();
        const big = cd.summary.bigSummaries.find((b) => b.id === bigId);
        if (!big) throw new Error('找不到这条总结');
        if (big.level >= 2) { toast('这条已经压缩过了（可点还原后重压）', 'info'); return; }

        // 粘贴导入的大总结是一整块文本，里面混着高光原话与物理锚点。
        // 压缩时必须额外交代"只压叙述、原话一字不改"，并保留原文以便还原。
        {
            const guard = `${s.prompts.summaryCompressPrompt}

【针对整块档案的额外规则（最高优先级）】
- 下面是一整份剧情档案，里面混有：转场标题、高光对话（带引号的角色原话）、不可忽略物理因素、线性摘要搬运记录。
- **只允许压缩"线性摘要搬运记录"里的叙述文字**。
- 【转场标题】【高光对话】里的每一句带引号原话与动作描写、【不可忽略物理因素】的每一条，都必须**逐字原样保留**，一个字都不许改写、合并或删除。
- 保持原有的层级结构与标签（例如 [Chapter_X]、[Dialogue_Anchor_X]、[Item_Anchor_X] 这类带反引号的标记）不变。
只输出压缩后的完整档案文本本身。`;
            const out = await callModel(guard, `【待压缩的剧情档案】\n${big.rawText}`, `压缩(导入):${big.fromCh}-${big.toCh}`, 'summary');
            big.compressedText = stripCodeFence(out).trim();
            big.level = 2;
            big.compressedAt = Date.now();
            saveChatData();
            updateInjections();
            log('info', 'system', `已压缩总结（第 ${big.fromCh}–${big.toCh} 章）。原文已保留，可随时还原。`);
            await flushChatData();
            return;
        }
        const idxByCh = new Map(cd.summary.index.map((x) => [x.chapter, x]));

        for (const sec of big.sections) {
            const texts = sec.chapters.map((n) => {
                const r = idxByCh.get(n);
                return r?.text ? `第${n}章：${r.text}` : null;
            }).filter(Boolean);
            if (texts.length <= 1) { sec.compressed = texts[0] || ''; continue; }
            try {
                const out = await callModel(s.prompts.summaryCompressPrompt,
                    `【转场区间】${sec.sceneName}（第 ${sec.chapters[0]}–${sec.chapters[sec.chapters.length - 1]} 章）\n\n【待压缩的章节摘要】\n${texts.join('\n')}`,
                    `压缩:${sec.sceneName}`, 'summary');
                sec.compressed = stripCodeFence(out).trim();
            } catch (err) {
                log('warn', 'system', `区间「${sec.sceneName}」压缩失败，保留原文：${err.message || err}`);
            }
        }
        big.level = 2;
        big.compressedAt = Date.now();
        saveChatData();
        updateInjections();
        log('info', 'system', `已压缩第 ${big.fromCh}–${big.toCh} 章的总结（高光对话与物理锚点未改动，原始摘要索引也完整保留）`);
    }

    /** 还原压缩：回到未压缩状态（原始数据一直都在，所以是无损的） */
    function restoreBigSummary(bigId) {
        const cd = chatData();
        const big = cd.summary.bigSummaries.find((b) => b.id === bigId);
        if (!big) return false;
        big.level = 1;
        big.compressedAt = null;
        if (big.imported) delete big.compressedText;
        else big.sections.forEach((sec) => { delete sec.compressed; });
        saveChatData();
        updateInjections();
        log('info', 'system', `已还原第 ${big.fromCh}–${big.toCh} 章的总结为未压缩状态`);
        return true;
    }

    /** 粘贴导入一条已经写好的大总结 */
    function importBigSummary(rawText, fromCh, toCh) {
        const cd = chatData();
        const text = String(rawText || '').trim();
        if (!text) throw new Error('内容为空');
        const from = Math.max(0, Number(fromCh) || 0);
        const to = Math.max(from, Number(toCh) || from);
        const big = {
            id: `sum_${Date.now().toString(36)}`,
            fromCh: from, toCh: to,
            createdAt: Date.now(),
            imported: true,
            rawText: text,
            sections: [],
            level: 1,
            compressedAt: null,
        };
        cd.summary.bigSummaries.push(big);
        cd.summary.bigSummaries.sort((a, b) => a.fromCh - b.fromCh);
        saveChatData();
        updateInjections();
        log('info', 'system', `导入大总结：第 ${from}–${to} 章，${text.length} 字`);
        return big;
    }

    /** 按你的模板把一条大总结渲染成文本；摘要正文直接取自扩展存档 */
    function renderBigSummary(big, { compressed = null } = {}) {
        // 大总结统一以整块文本保存（模型直接产出 / 粘贴导入），压缩后另存，随时可还原
        const useC = compressed === null ? (big.level >= 2) : compressed;
        return (useC && big.compressedText) ? big.compressedText : (big.rawText || '');
    }

    function renderAllSummariesText() {
        const cd = chatData();
        return cd.summary.bigSummaries.map((b) => renderBigSummary(b)).join('\n\n');
    }

    // 剧情推演：网状事件矩阵。事件=宏观篇章，分支按情感倾向跳转。
    // 正文出现隐藏标记后，扩展自动置灰未走分支并推进到下一事件。
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

【分支的写法（极其重要，写错会导致剧情卡死或跑偏）】
- 分支是**这个事件的结局走向**，不是用户的某个具体动作，也不是情绪描写。
- 正确示范：
    [事件01] {{user}} 撞见 {{char}} 在酒吧喝多了
      结果A：{{user}} 把 {{char}} 带回了家 → 指向 [事件02]
      结果B：{{user}} 没有带 {{char}} 回家 → 指向 [事件03]
    [事件02] 带回家之后
      结果A：两人爆发争吵 → …
      结果B：两人陷入冷战 → …
    [事件03] 没带回家之后（写 {{char}} 因此遭遇了什么，以及 {{user}} 要不要理会）
      结果A：{{user}} 主动过问 → …
      结果B：{{user}} 置之不理 → …
- **分支数量不限于 2 条**：有几种合理走向就写几条（2-4 条为宜），并且必须**穷尽覆盖**——
  任何一种可能的发展都应落进某一条，不留缝隙。若确有"什么都没做"这类走向，也要单列一条。
- **只写故事结果，不写描述**：禁止写穿着、表情、语气、情绪形容、心理活动、环境氛围。
  那些是正文该写的，推演只规定"故事往哪走"。
  ✗ 错误：结果A：{{user}} 红着眼眶心软了，颤抖着扶起对方
  ✓ 正确：结果A：{{user}} 把对方扶回家
- **导火索与事件过程可以慢慢铺垫**，用多少轮都行；但**分支只在最终结果确定的那一轮才算触发**。
  在结果尚未落定前，剧情锁死在当前事件内继续推进，不要提前跳转。
- 每条分支都必须写明指向哪个事件编号（或 OPEN / END）。

【输出格式】
只输出一个 JSON 对象，不要输出任何 Markdown 代码块围栏或解释文字，结构必须是：
{"events":[{"id":"01","title":"事件代号","core":"戏剧核心：本事件旨在催生/改变的情感张力",
"trigger":"导火索(起)：如何在正文中自然触发","branches":[
{"key":"A","condition":"该事件的一种结局走向（只写故事结果，不写描述）","next":"02"},
{"key":"B","condition":"另一种结局走向","next":"03"}]}]}
每个事件的 branches 可以有 2-4 条，覆盖所有合理走向。
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
- 分支判定看的是**这个事件最终走向了哪个结果**。结果尚未落定前，继续在当前事件内推进，不要提前跳转；
  一旦某条分支描述的结果在正文中确实达成，即判定该分支成立。
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
        const raw = await callModel(s.prompts.plotSystemPrompt, userPrompt, '剧情推演', 'plot');
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
    /**
     * 读取聊天记录。
     * @param {number} n      读取多少层
     * @param {number} offset 回避最新的多少层不读（楼层自动触发时用，留出重 roll 的余地）
     */
    function gatherHistory(n, offset = 0) {
        if (!n || n <= 0) return '';
        const c = ctx();
        const chat = c.chat || [];
        const end = Math.max(0, chat.length - Math.max(0, offset));
        const start = Math.max(0, end - n);
        return chat.slice(start, end)
            .map((m) => `${m.name}：${String(m.mes || '').slice(0, 2000)}`)
            .join('\n');
    }

    /** 本次实际读取了聊天记录的哪一段楼层（1 起算，含首尾） */
    function computeFloorRange(n, offset = 0) {
        const total = (ctx().chat || []).length;
        if (!n || n <= 0 || total === 0) return { from: 0, to: 0, count: 0, total, offset };
        const end = Math.max(0, total - Math.max(0, offset));
        if (end === 0) return { from: 0, to: 0, count: 0, total, offset };
        const count = Math.min(n, end);
        return { from: end - count + 1, to: end, count, total, offset };
    }

    function formatFloorRange(fr) {
        if (!fr || !fr.count) return '未读取聊天记录';
        const base = fr.from === fr.to ? `第 ${fr.to} 层` : `第 ${fr.from}–${fr.to} 层`;
        return fr.offset ? `${base}（回避最新 ${fr.offset} 层）` : base;
    }

    // 获取当前"已绑定/已激活"的世界书清单：全局勾选激活的世界书（读取酒馆世界书面板的
    // 多选框 #world_info，因为该激活列表未通过 getContext() 暴露）、当前角色绑定的主世界书、
    // 当前聊天绑定的聊天书。三者取并集去重。
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

    // 某条目是否要发送：优先用手动覆盖，没有则跟随它在酒馆里的启用状态
    function isWorldInfoEntrySendEnabled(s, bookName, uidStr, disabledInST) {
        const override = s.worldInfoOverrides[`${bookName}::${uidStr}`];
        return override !== undefined ? override : !disabledInST;
    }

    async function fetchWorldInfoEntriesForManagement() {
        const c = ctx();
        const out = [];
        for (const bookName of getBoundWorldInfoBookNames()) {
            try {
                const book = await c.loadWorldInfo(bookName);
                for (const e of (book?.entries ? Object.values(book.entries) : [])) {
                    out.push({
                        book: bookName,
                        uid: String(e.uid),
                        label: e.comment || (Array.isArray(e.key) ? e.key.join('，') : '') || `条目#${e.uid}`,
                        content: e.content || '',
                        disabledInST: !!e.disable,
                    });
                }
            } catch (err) {
                log('warn', 'system', `读取世界书「${bookName}」失败：${err.message || err}`, err);
            }
        }
        return out;
    }

    async function gatherWorldInfo() {
        const s = settings();
        const entries = await fetchWorldInfoEntriesForManagement();
        const sent = [], skipped = [];
        let text = '';
        for (const e of entries) {
            if (!isWorldInfoEntrySendEnabled(s, e.book, e.uid, e.disabledInST)) { skipped.push(e.label); continue; }
            sent.push(e.label);
            text += `【${e.book} - ${e.label}】\n${e.content}\n\n`;
        }
        if (entries.length) log('debug', 'system', `世界书条目筛选：发送 ${sent.length} 条，跳过 ${skipped.length} 条`, { 已发送: sent, 已跳过: skipped });
        return text.trim();
    }

    async function gatherExtras({ historyDepth, floorOffset = 0 } = {}) {
        const s = settings();
        const extras = { history: '', worldInfo: '', charBook: '' };
        const depth = historyDepth === undefined ? s.historyDepth : historyDepth;
        extras.history = gatherHistory(depth, floorOffset);
        extras.floorRange = computeFloorRange(depth, floorOffset);
        if (s.includeWorldInfo) extras.worldInfo = await gatherWorldInfo();
        return extras;
    }

    // ------------------------------------------------------------------
    // 模型调用（跟随酒馆当前 API，或使用独立 API）
    // ------------------------------------------------------------------
    /** 取某模块实际要用的 API 配置；返回 null 表示跟随酒馆 */
    function resolveModuleApi(moduleKey) {
        const s = settings();
        // 表格跟随组件时，API 也跟随组件的设置
        if (moduleKey === 'tables' && s.offscreen.triggerMode === 'auto' && s.offscreen.autoMode === 'follow') {
            moduleKey = 'widgets';
        }
        const conf = s.moduleApi?.[moduleKey];
        if (!conf || conf.mode !== 'preset') return null;
        const preset = (s.api.presets || []).find((x) => x.id === conf.presetId);
        if (!preset || !preset.url) {
            log('warn', 'request', `模块「${moduleKey}」指定了 API 预设但没找到有效配置，已回退为跟随酒馆`);
            return null;
        }
        return preset;
    }

    async function callModel(systemPrompt, userPrompt, label = '', moduleKey = '') {
        const preset = resolveModuleApi(moduleKey);
        log('info', 'request', `[${label}] 发起请求（${preset ? `独立API：${preset.name}` : '跟随酒馆'}）`, {
            systemPrompt,
            userPrompt,
        });
        let raw;
        try {
            if (preset) {
                raw = await callCustomApi(systemPrompt, userPrompt, preset);
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

    async function callCustomApi(systemPrompt, userPrompt, preset) {
        const base = preset.url.replace(/\/+$/, '');
        const headers = { 'Content-Type': 'application/json' };
        if (preset.key) headers['Authorization'] = `Bearer ${preset.key}`;
        const body = JSON.stringify({
            model: preset.model || undefined,
            messages: [
                ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
                { role: 'user', content: userPrompt },
            ],
            stream: false,
        });
        log('debug', 'request', `独立 API 请求：POST ${base}/chat/completions`, { preset: preset.name, model: preset.model, hasKey: !!preset.key });
        const res = await fetch(`${base}/chat/completions`, { method: 'POST', headers, body });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(`独立 API 请求失败：HTTP ${res.status} ${res.statusText} ${text.slice(0, 300)}`);
        }
        const data = await res.json();
        log('debug', 'response', '独立 API 原始返回', data);
        return data?.choices?.[0]?.message?.content ?? '';
    }

    async function fetchCustomModelList(preset) {
        const base = preset.url.replace(/\/+$/, '');
        const headers = {};
        if (preset.key) headers['Authorization'] = `Bearer ${preset.key}`;
        const res = await fetch(`${base}/models`, { headers });
        if (!res.ok) throw new Error(`拉取模型列表失败：HTTP ${res.status}`);
        const data = await res.json();
        const list = Array.isArray(data?.data) ? data.data.map((m) => m.id).filter(Boolean) : [];
        preset.modelList = list;
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
    async function generateWidget(widget, { floorOffset = 0 } = {}) {
        log('info', 'system', `开始生成组件「${widget.name}」`, { id: widget.id, prompt: widget.prompt });
        const extras = await gatherExtras({ floorOffset });
        const userPrompt = buildWidgetUserPrompt(widget, extras);
        const raw = await callModel(settings().prompts.widgetSystemPrompt, userPrompt, `组件:${widget.name}`, 'widgets');
        const html = stripCodeFence(raw);
        const cd = chatData();
        cd.widgetResults[widget.id] = { html, updatedAt: Date.now(), floorRange: extras.floorRange };
        saveChatData();
        log('info', 'system', `组件「${widget.name}」生成完成，已写入 chatMetadata.${MODULE_NAME}.widgetResults["${widget.id}"]`);
        return html;
    }

    async function generateAllWidgets({ onProgress, floorOffset = 0 } = {}) {
        const s = settings();
        const enabled = s.widgets.filter((w) => w.enabled);
        for (const w of enabled) {
            onProgress?.(w, 'start');
            try {
                await generateWidget(w, { floorOffset });
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
    async function generateOffscreen({ onProgress, floorOffset = 0 } = {}) {
        log('info', 'system', '开始生成/更新「表格生成」内容');
        onProgress?.('offscreen', 'start');
        const sOff = settings().offscreen;
        const depth = (sOff.triggerMode === 'auto' && sOff.autoMode === 'follow') ? settings().historyDepth : sOff.historyDepth;
        const extras = await gatherExtras({ historyDepth: depth, floorOffset });
        const userPrompt = buildOffscreenUserPrompt(extras);
        try {
            const raw = await callModel(buildOffscreenSystemPrompt(), userPrompt, '表格生成', 'tables');
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
            cd.offscreen.floorRange = extras.floorRange;
            saveChatData();
            log('info', 'system', `「表格生成」更新完成（读取${formatFloorRange(extras.floorRange)}）：${changed.join('、') || '（无表被更新，请检查上面的 parse 警告）'}`);
            onProgress?.('offscreen', 'done');
        } catch (err) {
            log('error', 'system', `「表格生成」生成失败：${err.message || err}`, err);
            onProgress?.('offscreen', 'error', err);
            throw err;
        }
        updateInjections();
    }

    // 组件预览的折叠状态：记在 localStorage，下次打开保持上次的样子
    const PREVIEW_FOLD_KEY = 'ego_preview_collapsed';
    function loadFoldState() {
        try { return new Set(JSON.parse(localStorage.getItem(PREVIEW_FOLD_KEY) || '[]')); }
        catch (e) { return new Set(); }
    }
    function saveFoldState(set) {
        try { localStorage.setItem(PREVIEW_FOLD_KEY, JSON.stringify([...set])); } catch (e) { /* 忽略 */ }
    }

    // 后台任务：与弹窗生命周期解耦，关掉界面也会跑完，开始/结束各提示一次。
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
        if (s.offscreen.enabled && s.offscreen.triggerMode === 'auto' && s.offscreen.autoMode === 'follow') {
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

        // 表格的楼层自动更新：与组件的触发方式完全独立，
        // 组件是手动模式时表格照样可以按自己的楼层间隔更新。
        try {
            const c1 = ctx();
            const mes1 = c1.chat?.[messageId];
            if (mes1 && !mes1.is_user && !mes1.is_system
                && s.offscreen.enabled && s.offscreen.triggerMode === 'auto' && s.offscreen.autoMode === 'floor') {
                const cdT = chatData();
                const floorNow = c1.chat.length;
                const iv = Math.max(1, Number(s.offscreen.floorInterval) || 1);
                const delta = floorNow - (cdT.autoTriggerState.lastOffscreenFloor || 0);
                log('debug', 'trigger', `[表格楼层触发] 当前第${floorNow}层，距上次已过${delta}层，间隔设置${iv}层`);
                if (delta >= iv && !isGenerating()) {
                    const backoff = Math.max(0, Number(s.autoTriggers.floorBackoff) || 0);
                    log('info', 'trigger', `[表格楼层触发] 达到间隔，开始生成（读取时回避最新 ${backoff} 层，留出重 roll 余地）`);
                    startBackgroundTask('表格生成', async () => {
                        await generateOffscreen({ floorOffset: backoff });
                        cdT.autoTriggerState.lastOffscreenFloor = floorNow;
                        saveChatData();
                    });
                }
            }
        } catch (err) {
            log('error', 'trigger', `表格楼层触发出错：${err.message || err}`, err);
        }

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
                    const backoff = Math.max(0, Number(s.autoTriggers.floorBackoff) || 0);
                    log('info', 'trigger', `[组件楼层触发] 达到间隔，自动生成组件（读取时回避最新 ${backoff} 层）`);
                    try {
                        await generateAllWidgets({ floorOffset: backoff });
                        at.lastWidgetFloor = currentFloor;
                        saveChatData();
                        refreshOpenPanels();
                    } catch (err) {
                        log('error', 'trigger', '[组件楼层触发] 生成失败', err);
                        toast('按楼层自动生成组件时出错，详见日志标签页', 'error');
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
        const s = settings();
        log('debug', 'inject', '更新正文注入');
        // 键名里带顺序号，改顺序会换键名，所以先把上一轮注册过的全部清空
        clearAllInjections();

        // 组件
        if (s.injectWidgets) {
            const cd = chatData();
            const text = s.widgets.filter((w) => w.enabled)
                .map((w) => cd.widgetResults[w.id]?.html).filter(Boolean).join('\n\n');
            if (text) setInjection('widgets', `[以下是与当前场景相关的附加参考素材，不要在正文中直接复述或提及其存在：\n${text}]`, s.injectDepth);
        }

        // 表格
        if (s.offscreen.enabled && s.offscreen.injectTables) {
            const text = renderOffscreenAsPlainText(chatData().offscreen);
            if (text) setInjection('tables', `[表格参考信息，仅用于保持世界的连贯性，不要直接照搬描述：\n${text}]`, s.offscreen.injectDepth);
        }

        // 本聊天设定：每条可有自己的位置/深度/顺序，按三者分组
        if (s.lore.injectEnabled) {
            buildLoreInjectionGroups().slice(0, 12).forEach((g, i) => {
                setInjection(`lore${i}`, `[本场景专属设定（请严格遵守，但不要在正文中直接复述本段）：\n${g.text}]`, g.depth);
            });
        }

        // 历史总结
        if (s.summary.injectEnabled) {
            const txt = renderAllSummariesText();
            if (txt) setInjection('summary', `[剧情档案（历史总结，供你保持连贯性，不要在正文中直接复述本段）：\n${txt}]`, s.summary.injectDepth);
        }

        // 剧情推演
        if (s.plot.injectEnabled) {
            const text = buildPlotInjectionText();
            if (text) setInjection('plot', text, s.plot.injectDepth);
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
              <div class="ow-tab" data-tab="summary">总结</div>
              <div class="ow-tab" data-tab="lore">设定</div>
              <div class="ow-tab" data-tab="favorites">收藏夹</div>
              <div class="ow-tab" data-tab="settings">设置</div>
            </div>
            <div class="ow-panel active" data-panel="widgets"></div>
            <div class="ow-panel" data-panel="offscreen"></div>
            <div class="ow-panel" data-panel="plot"></div>
            <div class="ow-panel" data-panel="summary"></div>
            <div class="ow-panel" data-panel="lore"></div>
            <div class="ow-panel" data-panel="favorites"></div>
            <div class="ow-panel" data-panel="settings"></div>
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
            ['summary', renderSummaryPanel],
            ['lore', renderLorePanel],
            ['favorites', renderFavoritesPanel],
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
        $logPanel = $modal.find('#ow_log_section');
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
            const withTables = so.enabled && so.triggerMode === 'auto' && so.autoMode === 'follow';
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
  html,body{margin:0;padding:0;background:#fff;height:auto;}
  #__ow_root{padding:12px;box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;line-height:1.6;}
  #__ow_root img,#__ow_root video,#__ow_root canvas,#__ow_root table{max-width:100%;}
</style></head><body>
<div id="__ow_root">${innerHtml}</div>
<script>
(function(){
  var id=${JSON.stringify(frameId)};
  var root=document.getElementById('__ow_root');
  var last=-1;
  function send(){
    if(!root) return;
    // 只量内容容器的高度，绝不能量 documentElement/body 的 scrollHeight：
    // html 会撑满 iframe 视口，父页面设完高度后它又变成新的测量值，
    // 于是每轮都比上轮更高，形成"一行一行不断变高"的反馈循环。
    var h=Math.ceil(root.getBoundingClientRect().height);
    if(h===last) return;
    last=h;
    try{ parent.postMessage({__owFrame:id,height:h},'*'); }catch(e){}
  }
  window.addEventListener('load',send);
  document.addEventListener('DOMContentLoaded',send);
  [50,200,600,1200,2000].forEach(function(t){setTimeout(send,t);});
  try{ new ResizeObserver(send).observe(root); }catch(e){}
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
            // 不再额外 +padding：srcdoc 里量的就是含内边距的内容高度。
            // 再加保护：与当前高度相差不足 4px 时忽略，避免亚像素抖动来回触发。
            const h = Math.min(Math.max(d.height, 80), 20000);
            const cur = parseInt(el.style.height || '0', 10);
            if (Math.abs(cur - h) >= 4) el.style.height = h + 'px';
        });
    }

    // ---- 组件显示（占满整个面板）----
    function renderWidgetResults($panel) {
        const s = settings();
        const cd = chatData();
        const $results = $panel.find('#ow_widget_results');
        $results.empty();

        bindPreviewAutoResize();
        const folded = loadFoldState();
        const withResults = s.widgets.filter((w) => cd.widgetResults[w.id]);
        if (!withResults.length) {
            $results.append('<div class="ow-empty">还没有生成结果。点「生成全部组件」，或在右上角「组件列表」里新建/单独生成。</div>');
            return;
        }
        for (const w of withResults) {
            const result = cd.widgetResults[w.id];
            $results.append(`
              <div class="ow-result-frame-wrap${folded.has(w.id) ? ' ow-preview-collapsed' : ''}" data-id="${w.id}">
                <div class="ow-result-head">
                  <span class="ow-result-title">
                    <span class="ow-caret ow-result-caret" data-action="toggle-preview" title="收起/展开"><i class="fa-solid fa-chevron-${folded.has(w.id) ? 'right' : 'down'}"></i></span>
                    <b>${escapeHtml(w.name)}</b>
                    <span class="ow-muted">${result.error ? '⚠️ 失败' : new Date(result.updatedAt).toLocaleString()}${result.floorRange?.count ? ` · 读至${escapeHtml(formatFloorRange(result.floorRange))}` : ''}</span>
                  </span>
                  <span>
                    <button class="ow-btn ow-fav-btn" data-action="favorite" data-id="${w.id}" title="收藏到收藏夹">
                      <i class="${isFavorited(w.id) ? 'fa-solid' : 'fa-regular'} fa-star"></i>
                    </button>
                    <button class="ow-btn" data-action="fullscreen" data-id="${w.id}" title="全屏"><i class="fa-solid fa-expand"></i></button>
                    <button class="ow-btn ow-danger" data-action="del-result" data-id="${w.id}" title="删除这条结果（组件定义保留）"><i class="fa-solid fa-trash"></i></button>
                    <button class="ow-btn" data-action="view-raw" data-id="${w.id}">源码</button>
                    <button class="ow-btn ow-gen-btn" data-action="regen-one" data-id="${w.id}">重新生成</button>
                  </span>
                </div>
                <iframe class="ow-result-frame" data-frame-id="${w.id}" sandbox="allow-scripts" allowfullscreen srcdoc="${escapeHtml(buildPreviewSrcdoc(result.html, w.id))}"></iframe>
              </div>`);
        }

        $results.off('click', '[data-action="toggle-preview"]').on('click', '[data-action="toggle-preview"]', function () {
            const $wrap = $(this).closest('.ow-result-frame-wrap');
            $wrap.toggleClass('ow-preview-collapsed');
            const collapsed = $wrap.hasClass('ow-preview-collapsed');
            $(this).find('i').attr('class', collapsed ? 'fa-solid fa-chevron-right' : 'fa-solid fa-chevron-down');
            const set = loadFoldState();
            if (collapsed) set.add($wrap.data('id')); else set.delete($wrap.data('id'));
            saveFoldState(set);
        });

        $results.off('click', '[data-action="del-result"]').on('click', '[data-action="del-result"]', function () {
            const id = $(this).data('id');
            const w = settings().widgets.find((x) => x.id === id);
            if (!confirm(`删除「${w?.name || '该组件'}」的这条生成结果？组件定义会保留，可随时重新生成。`)) return;
            delete chatData().widgetResults[id];
            saveChatData();
            updateInjections();
            renderWidgetResults($panel);
        });

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
            <span class="ow-muted">${off.updatedAt ? `上次更新 ${new Date(off.updatedAt).toLocaleString()}${off.floorRange?.count ? ` · 读取${escapeHtml(formatFloorRange(off.floorRange))}` : ''}` : '尚未生成'}</span>
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

        $tree.on('click', '[data-action="plot-edit"]', function () {
            openPlotEventEditor($(this).data('event'), $panel);
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
                <button class="ow-btn" data-action="plot-edit" data-event="${escapeHtml(ev.id)}" title="编辑此事件"><i class="fa-solid fa-pen"></i></button>
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

    // ---------------- 事件编辑子弹窗 ----------------
    function openPlotEventEditor(eventId, $plotPanel) {
        const pl = chatData().plot;
        const ev = getPlotEvent(eventId);
        if (!ev) return;
        const allIds = pl.events.map((e) => e.id);
        const nextOptions = (sel) => {
            const opts = allIds.map((id) => `<option value="${escapeHtml(id)}" ${sel === id ? 'selected' : ''}>事件${escapeHtml(id)}</option>`).join('');
            const up = String(sel || '').toUpperCase();
            return `${opts}
                <option value="OPEN" ${up === 'OPEN' ? 'selected' : ''}>开放结局（可续写）</option>
                <option value="END" ${up === 'END' ? 'selected' : ''}>最终结局</option>`;
        };
        const $ov = $(`
        <div class="ow-sub-overlay">
          <div class="ow-sub-modal" style="height:auto;max-height:85vh;width:min(640px,93vw);">
            <div class="ow-modal-header">
              <div class="ow-modal-title">编辑 [事件${escapeHtml(ev.id)}]</div>
              <div class="ow-close-btn ow-sub-close"><i class="fa-solid fa-xmark"></i></div>
            </div>
            <div class="ow-sub-body">
              <div class="ow-field-label">事件代号</div>
              <input type="text" class="ow-input" id="ow_pe_title" value="${escapeHtml(ev.title)}">
              <div class="ow-field-label">戏剧核心</div>
              <textarea class="ow-textarea" id="ow_pe_core" style="min-height:60px;">${escapeHtml(ev.core)}</textarea>
              <div class="ow-field-label">导火索</div>
              <textarea class="ow-textarea" id="ow_pe_trigger" style="min-height:60px;">${escapeHtml(ev.trigger)}</textarea>
              <div class="ow-field-label">终局分支（条件写情感倾向，不要写具体动作）</div>
              <div id="ow_pe_branches">
                ${ev.branches.map((b, i) => `
                  <div class="ow-widget-card" data-idx="${i}" style="margin-bottom:6px;">
                    <div class="ow-widget-card-head">
                      <span class="ow-branch-key">${escapeHtml(b.key)}</span>
                      <span class="ow-muted">指向</span>
                      <select class="ow-select ow-pe-next">${nextOptions(b.next)}</select>
                      <span class="ow-spacer"></span>
                      <button class="ow-btn ow-danger" data-action="pe-del-branch" title="删除分支">✕</button>
                    </div>
                    <textarea class="ow-textarea ow-pe-cond" style="min-height:56px;" placeholder="若用户表现出……类情感倾向（无论以何种方式表达）">${escapeHtml(b.condition)}</textarea>
                  </div>`).join('')}
              </div>
              <div class="ow-row"><button class="ow-btn" id="ow_pe_add_branch">+ 添加分支</button></div>
              <div class="ow-row" style="margin-top:14px;justify-content:flex-end;">
                <button class="ow-btn ow-sub-close">取消</button>
                <button class="ow-btn ow-primary" id="ow_pe_save">保存</button>
              </div>
            </div>
          </div>
        </div>`).appendTo(document.documentElement);

        const close = () => $ov.remove();
        $ov.on('click', (e) => { if ($(e.target).hasClass('ow-sub-overlay')) close(); });
        $ov.find('.ow-sub-close').on('click', close);

        $ov.on('click', '[data-action="pe-del-branch"]', function () {
            if ($ov.find('#ow_pe_branches .ow-widget-card').length <= 1) { toast('至少要保留一条分支', 'warning'); return; }
            $(this).closest('.ow-widget-card').remove();
        });
        $ov.find('#ow_pe_add_branch').on('click', function () {
            const used = $ov.find('#ow_pe_branches .ow-widget-card').map(function () { return $(this).find('.ow-branch-key').text(); }).get();
            let key = 'A';
            for (let i = 0; i < 26; i++) { const k = String.fromCharCode(65 + i); if (!used.includes(k)) { key = k; break; } }
            $ov.find('#ow_pe_branches').append(`
              <div class="ow-widget-card" style="margin-bottom:6px;">
                <div class="ow-widget-card-head">
                  <span class="ow-branch-key">${key}</span>
                  <span class="ow-muted">指向</span>
                  <select class="ow-select ow-pe-next">${nextOptions('OPEN')}</select>
                  <span class="ow-spacer"></span>
                  <button class="ow-btn ow-danger" data-action="pe-del-branch">✕</button>
                </div>
                <textarea class="ow-textarea ow-pe-cond" style="min-height:56px;" placeholder="若用户表现出……类情感倾向（无论以何种方式表达）"></textarea>
              </div>`);
        });

        $ov.find('#ow_pe_save').on('click', function () {
            ev.title = String($ov.find('#ow_pe_title').val() || '').trim() || ev.title;
            ev.core = String($ov.find('#ow_pe_core').val() || '').trim();
            ev.trigger = String($ov.find('#ow_pe_trigger').val() || '').trim();
            const branches = [];
            $ov.find('#ow_pe_branches .ow-widget-card').each(function () {
                branches.push({
                    key: $(this).find('.ow-branch-key').text().trim().toUpperCase().slice(0, 1),
                    condition: String($(this).find('.ow-pe-cond').val() || '').trim(),
                    next: String($(this).find('.ow-pe-next').val() || 'OPEN').trim(),
                });
            });
            if (branches.length) ev.branches = branches;
            const issues = validateAndRepairPlot(pl.events);
            if (issues.deadloop.length) {
                toast(`注意：事件 ${issues.deadloop.join('、')} 现在走不到结局了`, 'warning');
            }
            saveChatData();
            updateInjections();
            log('info', 'ui', `手动编辑了事件 ${ev.id}`);
            close();
            renderPlotPanel($plotPanel);
        });
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

    // ---------------- 本聊天设定面板 ----------------
    function renderLorePanel($panel) {
        const s = settings();
        const list = loreEntries();
        const chat = ctx().chat || [];
        const recentText = chat.slice(-Math.max(1, Number(s.lore.scanDepth) || 10)).map((m) => String(m.mes || '')).join('\n');
        const activeN = list.filter((e) => isLoreEntryActive(e, recentText)).length;

        $panel.html(`
        <div class="ow-panel-bar">
          <div class="ow-row" style="margin:0;">
            <button class="ow-btn ow-primary" id="ow_lore_add"><i class="fa-solid fa-plus"></i> 新建设定</button>
            <span class="ow-muted">${list.length} 条 · 当前生效 ${activeN} 条${s.lore.injectEnabled ? '' : ' · <b>注入已关闭</b>'}</span>
          </div>
          <span class="ow-muted">只属于当前聊天</span>
        </div>
        <div class="ow-hint">这些设定只存在这个聊天里，换聊天/换角色都看不到，也不会写进角色卡世界书。<br>
        关键词留空＝常驻注入；填了关键词＝最近若干层聊天里出现该词才注入（省 token）。</div>
        <div id="ow_lore_list"></div>`);

        const $list = $panel.find('#ow_lore_list');
        if (!list.length) {
            $list.html('<div class="ow-empty">还没有设定。点上方「新建设定」，可以写只属于这个聊天的世界设定、NPC 或用户人设。</div>');
        } else {
            const byType = {};
            for (const e of list) (byType[e.type || 'other'] = byType[e.type || 'other'] || []).push(e);
            let html = '';
            for (const t of LORE_TYPES) {
                const arr = byType[t.id];
                if (!arr?.length) continue;
                html += `<div class="ow-section-title">${t.name}（${arr.length}）</div>`;
                html += arr.map((e) => {
                    const active = isLoreEntryActive(e, recentText);
                    return `
                  <div class="ow-widget-card ow-collapsed" data-lid="${escapeHtml(e.id)}">
                    <div class="ow-widget-card-head">
                      <span class="ow-caret" data-action="lore-toggle"><i class="fa-solid fa-chevron-right"></i></span>
                      <label class="ow-switch" title="启用/停用">
                        <input type="checkbox" class="ow-lore-on" ${e.enabled !== false ? 'checked' : ''}><span class="ow-switch-track"></span>
                      </label>
                      <span class="ow-widget-name" data-action="lore-toggle">${escapeHtml(e.name || '未命名')}</span>
                      <span class="ow-muted ow-widget-meta">${e.keywords ? `关键词：${escapeHtml(String(e.keywords).slice(0, 16))}` : '常驻'} · 深度${e.depth ?? 0}${e.enabled !== false ? (active ? '' : ' · 未命中') : ''}</span>
                      <span class="ow-spacer"></span>
                      <button class="ow-btn ow-danger" data-action="lore-del"><i class="fa-solid fa-trash"></i></button>
                    </div>
                    <div class="ow-widget-card-body">
                      <div class="ow-field-label">名称</div>
                      <input type="text" class="ow-input ow-lore-name" value="${escapeHtml(e.name || '')}">
                      <div class="ow-field-label">分类</div>
                      <select class="ow-select ow-lore-type">
                        ${LORE_TYPES.map((t2) => `<option value="${t2.id}" ${((e.type || 'other') === t2.id) ? 'selected' : ''}>${t2.name}</option>`).join('')}
                      </select>
                      <div class="ow-field-label">内容</div>
                      <textarea class="ow-textarea ow-lore-content" style="min-height:120px;">${escapeHtml(e.content || '')}</textarea>
                      <div class="ow-field-label">关键词（可选，逗号分隔；留空＝常驻注入）</div>
                      <input type="text" class="ow-input ow-lore-kw" value="${escapeHtml(e.keywords || '')}" placeholder="例：林医生, 医院, 白大褂">
                      <div class="ow-field-label">注入深度</div>
                      <div class="ow-row">
                        <input type="number" class="ow-input ow-num ow-lore-edepth" min="0" value="${e.depth ?? 0}">
                        <span class="ow-muted">数字越小越靠近最新消息</span>
                      </div>
                    </div>
                  </div>`;
                }).join('');
            }
            $list.html(html);
        }

        $panel.find('#ow_lore_add').on('click', function () {
            loreEntries().push({ id: `lore_${Date.now().toString(36)}`, name: '新设定', type: 'setting', content: '', keywords: '', enabled: true, depth: 0 });
            saveChatData(); updateInjections(); renderLorePanel($panel);
        });

        const find = (el) => loreEntries().find((x) => x.id === $(el).closest('.ow-widget-card').data('lid'));
        $list.on('click', '[data-action="lore-toggle"]', function () {
            const $c = $(this).closest('.ow-widget-card');
            $c.toggleClass('ow-collapsed');
            $c.find('.ow-caret i').attr('class', $c.hasClass('ow-collapsed') ? 'fa-solid fa-chevron-right' : 'fa-solid fa-chevron-down');
        });
        $list.on('change', '.ow-lore-on', function () { const e = find(this); if (e) { e.enabled = $(this).is(':checked'); saveChatData(); updateInjections(); } });
        $list.on('input', '.ow-lore-name', function () {
            const e = find(this); if (!e) return; e.name = $(this).val(); saveChatData();
            $(this).closest('.ow-widget-card').find('.ow-widget-name').text(e.name || '未命名');
        });
        $list.on('input', '.ow-lore-content', function () { const e = find(this); if (e) { e.content = $(this).val(); saveChatData(); updateInjections(); } });
        $list.on('input', '.ow-lore-kw', function () { const e = find(this); if (e) { e.keywords = $(this).val(); saveChatData(); updateInjections(); } });
        $list.on('change', '.ow-lore-edepth', function () {
            const e = find(this); if (!e) return;
            e.depth = Math.max(0, Number($(this).val()) || 0);
            saveChatData(); updateInjections();
        });
        $list.on('change', '.ow-lore-type', function () { const e = find(this); if (e) { e.type = $(this).val(); saveChatData(); renderLorePanel($panel); } });
        $list.on('click', '[data-action="lore-del"]', function () {
            const e = find(this);
            if (!e || !confirm(`删除设定「${e.name}」？`)) return;
            chatData().lore.entries = loreEntries().filter((x) => x.id !== e.id);
            saveChatData(); updateInjections(); renderLorePanel($panel);
        });
    }

    // ---------------- 总结面板 ----------------
    function renderSummaryPanel($panel) {
        const s = settings();
        const cd = chatData();
        const sm = cd.summary;
        const doneRaw = lastSummarizedChapter();
        const done = doneRaw === null ? '—' : doneRaw;
        const to0 = maxChapter();
        const u = unitName();

        $panel.html(`
        <div class="ow-panel-bar">
          <div class="ow-row" style="margin:0;">
            <button class="ow-btn ow-primary ow-gen-btn" id="ow_sum_gen"><i class="fa-solid fa-layer-group"></i> 大总结</button>
            <span class="ow-muted">当前最大第 ${to0} ${u} · 已总结至第 ${done} ${u}${doneRaw === null || to0 > doneRaw ? ` · 待整理 ${to0 - (doneRaw === null ? nextSummaryStart() - 1 : doneRaw)} ${u}` : ''}</span>
          </div>
          <span>
            <button class="ow-btn" id="ow_sum_impbig_btn"><i class="fa-solid fa-file-lines"></i> 导入大总结</button>
            <button class="ow-btn" id="ow_sum_hide_btn"><i class="fa-solid fa-eye-slash"></i> 隐藏楼层</button>
          </span>
        </div>
        <div id="ow_sum_list"></div>`);

        const $list = $panel.find('#ow_sum_list');
        if (!sm.bigSummaries.length) {
            $list.html(`<div class="ow-empty">还没有大总结。<br><span class="ow-muted">点「大总结」，模型会把范围内各章现成的摘要按场景编排成档案。生成后可自行审核，不满意点「重新生成」。</span></div>`);
        } else {
            $list.html(sm.bigSummaries.map((b, i) => {
                return `
              <div class="ow-widget-card ow-collapsed" data-sid="${escapeHtml(b.id)}">
                <div class="ow-widget-card-head">
                  <span class="ow-caret" data-action="sum-toggle"><i class="fa-solid fa-chevron-right"></i></span>
                  <span class="ow-widget-name" data-action="sum-toggle">第 ${b.fromCh}–${b.toCh} ${u}</span>
                  <span class="ow-muted ow-widget-meta">${b.imported ? '粘贴导入' : '模型生成'} · ${b.level >= 2 ? '已压缩' : '原始'} · ${(b.rawText || '').length} 字</span>
                  <span class="ow-spacer"></span>
                  ${b.imported ? '' : `<button class="ow-btn ow-gen-btn" data-action="sum-regen" title="重新生成这一段（章号范围不变，覆盖原内容）"><i class="fa-solid fa-arrows-rotate"></i> 重新生成</button>`}
                  ${b.level < 2
                    ? `<button class="ow-btn ow-gen-btn" data-action="sum-compress" title="压缩叙述（高光原话与物品锚点一字不改）"><i class="fa-solid fa-compress"></i> 压缩</button>`
                    : `<button class="ow-btn" data-action="sum-restore" title="还原为未压缩（原始数据一直保留）"><i class="fa-solid fa-rotate-left"></i> 还原</button>`}
                  <button class="ow-btn" data-action="sum-copy" title="复制文本"><i class="fa-regular fa-copy"></i></button>
                  <button class="ow-btn ow-danger" data-action="sum-del" title="删除"><i class="fa-solid fa-trash"></i></button>
                </div>
                <div class="ow-widget-card-body">
                  <pre class="ow-preview-box" style="max-height:420px;">${escapeHtml(renderBigSummary(b))}</pre>
                </div>
              </div>`;
            }).join(''));
        }

        $panel.find('#ow_sum_gen').on('click', () => startBackgroundTask('大总结', () => generateBigSummary()));
        $panel.find('#ow_sum_hide_btn').on('click', () => openHideDialog($panel));
        $panel.find('#ow_sum_impbig_btn').on('click', () => openImportBigDialog($panel));

        $list.on('click', '[data-action="sum-toggle"]', function () {
            const $c = $(this).closest('.ow-widget-card');
            $c.toggleClass('ow-collapsed');
            $c.find('.ow-caret i').attr('class', $c.hasClass('ow-collapsed') ? 'fa-solid fa-chevron-right' : 'fa-solid fa-chevron-down');
        });
        $list.on('click', '[data-action="sum-compress"]', function () {
            const id = $(this).closest('.ow-widget-card').data('sid');
            if (!confirm('压缩这条总结的叙述部分？高光对话与物理锚点不会被改动，原始每章摘要也完整保留。')) return;
            startBackgroundTask('压缩总结', async () => { await compressBigSummary(id); });
        });
        $list.on('click', '[data-action="sum-regen"]', function () {
            const id = $(this).closest('.ow-widget-card').data('sid');
            const b = sm.bigSummaries.find((x) => x.id === id);
            if (!b || !confirm(`重新生成第 ${b.fromCh}–${b.toCh} ${u} 的大总结？当前内容会被覆盖。`)) return;
            startBackgroundTask(`重新生成 ${b.fromCh}-${b.toCh}`, () => regenerateBigSummary(id));
        });
        $list.on('click', '[data-action="sum-restore"]', function () {
            const id = $(this).closest('.ow-widget-card').data('sid');
            if (!confirm('还原为未压缩状态？原始数据一直保留着，所以是无损的。')) return;
            restoreBigSummary(id);
            renderSummaryPanel($panel);
        });
        $list.on('click', '[data-action="sum-copy"]', async function () {
            const id = $(this).closest('.ow-widget-card').data('sid');
            const b = sm.bigSummaries.find((x) => x.id === id);
            if (!b) return;
            try { await navigator.clipboard.writeText(renderBigSummary(b)); toast('已复制', 'success'); }
            catch (e) { toast('复制失败，可从下方文本框手动选取', 'warning'); }
        });
        $list.on('click', '[data-action="sum-del"]', function () {
            const id = $(this).closest('.ow-widget-card').data('sid');
            const b = sm.bigSummaries.find((x) => x.id === id);
            if (!b || !confirm(`删除第 ${b.fromCh}–${b.toCh} ${u} 的总结？`)) return;
            sm.bigSummaries = sm.bigSummaries.filter((x) => x.id !== id);
            saveChatData(); updateInjections(); renderSummaryPanel($panel);
        });
        refreshGeneratingIndicator();
    }

    // ---------------- 导入大总结子弹窗 ----------------
    function openImportBigDialog($sumPanel) {
        const done = lastSummarizedChapter() ?? 0;
        const $ov = $(`
        <div class="ow-sub-overlay">
          <div class="ow-sub-modal" style="height:auto;max-height:88vh;width:min(700px,93vw);">
            <div class="ow-modal-header">
              <div class="ow-modal-title">导入大总结</div>
              <div class="ow-close-btn ow-sub-close"><i class="fa-solid fa-xmark"></i></div>
            </div>
            <div class="ow-sub-body">
              <div class="ow-hint">把你已经写好的整份大总结粘进来，指定它覆盖的范围即可（单位同当前计数方式）。<br>
              导入的内容会**原样保存**，注入正文时按原文发送。压缩时会额外交代模型只压缩叙述、
              高光原话与物理锚点逐字保留，并且原文一直留着，随时可以还原。</div>
              <div class="ow-row">
                <label>覆盖 第 <input type="number" class="ow-input ow-num" id="ow_ib_from" min="0" value="${done + 1}"></label>
                <label>到 第 <input type="number" class="ow-input ow-num" id="ow_ib_to" min="0" value="${done + 1}"></label>
                <span class="ow-muted">当前已总结至第 ${done}</span>
              </div>
              <div class="ow-field-label">大总结全文</div>
              <textarea class="ow-textarea" id="ow_ib_text" style="min-height:280px;" placeholder="&lt;大总结(第1-20章)&gt;
- 【转场标题一】：玄关 - 时间：2024.10.24 20:00
  - 核心锚点：
    - 高光对话 \`[Dialogue_Anchor_1]\`：
        安琳：“你终于来了。”
  - 线性摘要搬运记录：
    - \`[Chapter_1]\`：……
&lt;/大总结(第1-20章)&gt;"></textarea>
              <div class="ow-row" style="margin-top:10px;justify-content:flex-end;">
                <button class="ow-btn ow-sub-close">取消</button>
                <button class="ow-btn ow-primary" id="ow_ib_do">确认导入</button>
              </div>
            </div>
          </div>
        </div>`).appendTo(document.documentElement);

        const close = () => { $ov.remove(); renderSummaryPanel($sumPanel); };
        $ov.on('click', (e) => { if ($(e.target).hasClass('ow-sub-overlay')) close(); });
        $ov.find('.ow-sub-close').on('click', close);

        // 粘贴时如果标题里写了章号范围，自动填进上面的输入框
        $ov.find('#ow_ib_text').on('input', function () {
            const m = /第\s*(\d+)\s*[-–~至]\s*(\d+)\s*章/.exec(String($(this).val() || ''));
            if (m) { $ov.find('#ow_ib_from').val(m[1]); $ov.find('#ow_ib_to').val(m[2]); }
        });
        $ov.find('#ow_ib_do').on('click', function () {
            const txt = $ov.find('#ow_ib_text').val();
            if (!String(txt || '').trim()) { toast('请先粘贴内容', 'warning'); return; }
            const from = Number($ov.find('#ow_ib_from').val()) || 1;
            const to = Number($ov.find('#ow_ib_to').val()) || from;
            if (to < from) { toast('结束章号不能小于起始章号', 'warning'); return; }
            try {
                importBigSummary(txt, from, to);
                toast(`已导入第 ${from}–${to} 章的大总结`, 'success');
                close();
            } catch (err) { toast(`导入失败：${err.message || err}`, 'error'); }
        });
    }

    // ---------------- 隐藏楼层子弹窗 ----------------
    function openHideDialog($sumPanel) {
        const cd = chatData();
        const total = (ctx().chat || []).length;
        const suggest = Math.max(0, total - 20);
        const $ov = $(`
        <div class="ow-sub-overlay">
          <div class="ow-sub-modal" style="height:auto;max-height:80vh;width:min(560px,93vw);">
            <div class="ow-modal-header">
              <div class="ow-modal-title">隐藏 / 恢复楼层</div>
              <div class="ow-close-btn ow-sub-close"><i class="fa-solid fa-xmark"></i></div>
            </div>
            <div class="ow-sub-body">
              <div class="ow-hint">手动指定区间，不会自动隐藏任何东西。走的是酒馆自带的 <code>/hide</code> / <code>/unhide</code>，
              与你用斜杠命令或 QR 的效果完全一致，随时可恢复。<br>
              楼层号即酒馆的消息 ID（<b>从 0 开始</b>，与 <code>/hide 0-33</code> 的写法一致）。当前共 ${total} 条消息，最大 ID 为 ${Math.max(0, total - 1)}。${suggest > 1 ? `建议可隐藏到 ${suggest - 1}（保留最近 20 条）。` : ''}</div>
              <div class="ow-row">
                <label>从 <input type="number" class="ow-input ow-num" id="ow_hide_from" min="0" value="0"></label>
                <label>到 <input type="number" class="ow-input ow-num" id="ow_hide_to" min="0" value="${suggest > 1 ? suggest - 1 : 0}"></label>
              </div>
              <div class="ow-row">
                <button class="ow-btn ow-primary" id="ow_hide_do"><i class="fa-solid fa-eye-slash"></i> 隐藏该区间</button>
                <button class="ow-btn" id="ow_unhide_do"><i class="fa-solid fa-eye"></i> 恢复该区间</button>
              </div>
              <div class="ow-section-title">已隐藏记录</div>
              <div id="ow_hide_list"></div>
            </div>
          </div>
        </div>`).appendTo(document.documentElement);

        const close = () => { $ov.remove(); renderSummaryPanel($sumPanel); };
        $ov.on('click', (e) => { if ($(e.target).hasClass('ow-sub-overlay')) close(); });
        $ov.find('.ow-sub-close').on('click', close);

        const renderHidden = () => {
            const $l = $ov.find('#ow_hide_list');
            if (!cd.summary.hidden.length) { $l.html('<div class="ow-muted">暂无</div>'); return; }
            $l.html(cd.summary.hidden.map((h, i) => `
              <div class="ow-row" data-idx="${i}">
                <span>${h.from}–${h.to} <span class="ow-muted">${new Date(h.at).toLocaleString()}</span></span>
                <span class="ow-spacer"></span>
                <button class="ow-btn" data-action="unhide-one">恢复</button>
              </div>`).join(''));
        };
        renderHidden();

        const applyHide = async (hide) => {
            const from = Math.max(0, Number($ov.find('#ow_hide_from').val()) || 0);
            const to = Number($ov.find('#ow_hide_to').val());
            if (!(to >= from)) { toast('结束楼层不能小于起始楼层', 'warning'); return; }
            const c = ctx();

            // 【关键】先把扩展自己的数据落盘。
            // 隐藏会触发酒馆保存/重绘聊天，而我们的 saveChatData 是防抖的，
            // 没落盘的大总结、表格、推演进度会在那一刻丢失（之前就是这么丢的）。
            try {
                if (typeof c.saveMetadata === 'function') await c.saveMetadata();
                log('debug', 'system', '隐藏操作前已强制保存扩展数据');
            } catch (err) {
                log('warn', 'system', `保存扩展数据失败，已中止隐藏操作以免丢数据：${err.message || err}`);
                toast('保存扩展数据失败，已取消本次操作', 'error');
                return;
            }

            const cmd = `/${hide ? 'hide' : 'unhide'} ${from}-${to}`;
            let ok = false;
            // 优先走酒馆自己的 /hide /unhide —— 与 QR 完全同一条路径，行为一致
            try {
                if (typeof c.executeSlashCommandsWithOptions === 'function') {
                    await c.executeSlashCommandsWithOptions(cmd, { handleParserErrors: true });
                    ok = true;
                } else if (typeof c.executeSlashCommands === 'function') {
                    await c.executeSlashCommands(cmd);
                    ok = true;
                }
            } catch (err) {
                log('warn', 'system', `调用 ${cmd} 失败，改用兜底实现：${err.message || err}`);
            }

            // 兜底：复刻酒馆 hideChatMessageRange 的做法
            // （改 is_system + 同步 DOM 的 is_system 属性 + 正常保存；绝不 reload）
            if (!ok) {
                let n = 0;
                for (let id = from; id <= to; id++) {
                    const msg = c.chat?.[id];
                    if (!msg) continue;
                    msg.is_system = hide;
                    const $block = $(`.mes[mesid="${id}"]`);
                    if ($block.length) $block.attr('is_system', String(hide));
                    n++;
                }
                try { await c.saveChat?.(); } catch (err) { log('warn', 'system', `保存聊天失败：${err.message || err}`); }
                log('info', 'system', `兜底实现处理了 ${n} 条消息`);
            }

            if (hide) cd.summary.hidden.push({ from, to, at: Date.now() });
            else cd.summary.hidden = cd.summary.hidden.filter((h) => !(h.from === from && h.to === to));
            saveChatData();
            try { if (typeof c.saveMetadata === 'function') await c.saveMetadata(); } catch (e) { /* 已尽力 */ }

            log('info', 'system', `${hide ? '隐藏' : '恢复'}了消息 ${from}-${to}（${ok ? `经由酒馆 ${cmd}` : '兜底实现'}）`);
            toast(`${hide ? '已隐藏' : '已恢复'} ${from}-${to}${hide ? '（可随时恢复）' : ''}`, 'success');
            renderHidden();
        };
        $ov.find('#ow_hide_do').on('click', () => applyHide(true));
        $ov.find('#ow_unhide_do').on('click', () => applyHide(false));
        $ov.on('click', '[data-action="unhide-one"]', function () {
            const h = cd.summary.hidden[$(this).closest('.ow-row').data('idx')];
            if (!h) return;
            $ov.find('#ow_hide_from').val(h.from);
            $ov.find('#ow_hide_to').val(h.to);
            applyHide(false);
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
        try {
            bookNames = getBoundWorldInfoBookNames();
        } catch (err) {
            log('error', 'system', `识别世界书失败：${err.message || err}`, err);
            $list.html('<div class="ow-empty">识别世界书时出错，详见日志标签页。</div>');
            return;
        }
        $panel.find('#ow_wi_book_names').text(bookNames.length ? bookNames.join('、') : '（未识别到已激活的世界书/聊天书）');
        if (!bookNames.length) {
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
            const shownName = book;
            html += `
            <div class="ow-widget-card" data-book="${escapeHtml(book)}">
              <div class="ow-widget-card-head">
                <i class="fa-solid fa-book" style="opacity:.55;"></i>
                <span class="ow-widget-name">${escapeHtml(shownName)}</span>

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
        </div>

        <div class="ow-group">
          <div class="ow-group-title"><i class="fa-solid fa-layer-group"></i> 总结 · 编排提示词</div>
          <div class="ow-hint">模型只输出结构（转场/高光/物品锚点），摘要正文由扩展从存档原样填入，不经模型改写。</div>
          <div class="ow-row"><button class="ow-btn" id="ow_prompt_sum_reset">恢复默认</button></div>
          <textarea class="ow-textarea" id="ow_prompt_sum" style="min-height:240px;">${escapeHtml(s.prompts.summarySystemPrompt)}</textarea>
        </div>

        <div class="ow-group">
          <div class="ow-group-title"><i class="fa-solid fa-compress"></i> 总结 · 压缩提示词</div>
          <div class="ow-hint">只压缩叙述部分；高光对话与物理锚点不会进入这个请求，因此不可能被改写。</div>
          <div class="ow-row"><button class="ow-btn" id="ow_prompt_sumc_reset">恢复默认</button></div>
          <textarea class="ow-textarea" id="ow_prompt_sumc" style="min-height:160px;">${escapeHtml(s.prompts.summaryCompressPrompt)}</textarea>
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
        $panel.find('#ow_prompt_sum').on('input', function () { s.prompts.summarySystemPrompt = $(this).val(); saveSettings(); });
        $panel.find('#ow_prompt_sum_reset').on('click', function () {
            if (!confirm('恢复默认？')) return;
            s.prompts.summarySystemPrompt = DEFAULT_SUMMARY_SYSTEM_PROMPT; saveSettings(); renderPromptsPanel($panel);
        });
        $panel.find('#ow_prompt_sumc').on('input', function () { s.prompts.summaryCompressPrompt = $(this).val(); saveSettings(); });
        $panel.find('#ow_prompt_sumc_reset').on('click', function () {
            if (!confirm('恢复默认？')) return;
            s.prompts.summaryCompressPrompt = DEFAULT_SUMMARY_COMPRESS_PROMPT; saveSettings(); renderPromptsPanel($panel);
        });
        $panel.find('#ow_prompt_preview_btn').on('click', function () {
            const $box = $panel.find('#ow_prompt_preview');
            if ($box.is(':visible')) { $box.hide(); return; }
            $box.text(buildOffscreenSystemPrompt()).show();
        });
    }

    /** 生成"跟随酒馆 / 独立API预设"的选择行 */
    function moduleApiRow(moduleKey, label, disabled = false, note = '') {
        const s = settings();
        const conf = s.moduleApi[moduleKey] || { mode: 'system', presetId: '' };
        const presets = s.api.presets || [];
        const dis = disabled ? 'disabled' : '';
        return `
        <div class="ow-field-label">${label}</div>
        <div class="ow-row ${disabled ? 'ow-disabled' : ''}" data-api-module="${moduleKey}">
          <label><input type="radio" name="ow_mapi_${moduleKey}" value="system" ${conf.mode !== 'preset' ? 'checked' : ''} ${dis}> 跟随酒馆</label>
          <label><input type="radio" name="ow_mapi_${moduleKey}" value="preset" ${conf.mode === 'preset' ? 'checked' : ''} ${dis}> 独立 API</label>
          <select class="ow-select ow-mapi-preset" data-module="${moduleKey}" ${conf.mode === 'preset' && !disabled ? '' : 'disabled'}>
            ${presets.length ? presets.map((p) => `<option value="${escapeHtml(p.id)}" ${conf.presetId === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('') : '<option value="">（还没有预设）</option>'}
          </select>
          ${note ? `<span class="ow-muted">${note}</span>` : ''}
        </div>`;
    }

    function bindModuleApiRows($panel) {
        const s = settings();
        $panel.off('change', '[name^="ow_mapi_"]').on('change', '[name^="ow_mapi_"]', function () {
            const mk = $(this).attr('name').replace('ow_mapi_', '');
            s.moduleApi[mk] = s.moduleApi[mk] || { mode: 'system', presetId: '' };
            s.moduleApi[mk].mode = $(this).val();
            if (s.moduleApi[mk].mode === 'preset' && !s.moduleApi[mk].presetId) {
                s.moduleApi[mk].presetId = s.api.presets?.[0]?.id || '';
            }
            saveSettings();
            renderSettingsPanel($panel);
        });
        $panel.off('change', '.ow-mapi-preset').on('change', '.ow-mapi-preset', function () {
            const mk = $(this).data('module');
            s.moduleApi[mk] = s.moduleApi[mk] || { mode: 'preset', presetId: '' };
            s.moduleApi[mk].presetId = $(this).val();
            saveSettings();
        });
    }

    function renderApiPresets($panel) {
        const s = settings();
        const $box = $panel.find('#ow_api_presets');
        if (!$box.length) return;
        const list = s.api.presets || [];
        if (!list.length) { $box.html('<div class="ow-muted">还没有预设，点下方新建。</div>'); }
        else {
            $box.html(list.map((p) => `
              <div class="ow-widget-card ow-collapsed" data-pid="${escapeHtml(p.id)}">
                <div class="ow-widget-card-head">
                  <span class="ow-caret" data-action="api-toggle"><i class="fa-solid fa-chevron-right"></i></span>
                  <span class="ow-widget-name" data-action="api-toggle">${escapeHtml(p.name || '未命名')}</span>
                  <span class="ow-muted ow-widget-meta">${escapeHtml(p.model || '未选模型')}</span>
                  <span class="ow-spacer"></span>
                  <button class="ow-btn ow-danger" data-action="api-del"><i class="fa-solid fa-trash"></i></button>
                </div>
                <div class="ow-widget-card-body">
                  <div class="ow-field-label">名称</div>
                  <input type="text" class="ow-input ow-api-name" value="${escapeHtml(p.name || '')}">
                  <div class="ow-field-label">URL</div>
                  <input type="text" class="ow-input ow-api-url" value="${escapeHtml(p.url || '')}" placeholder="https://api.openai.com/v1">
                  <div class="ow-field-label">Key</div>
                  <input type="password" class="ow-input ow-api-key" value="${escapeHtml(p.key || '')}">
                  <div class="ow-field-label">模型</div>
                  <div class="ow-row">
                    <select class="ow-select ow-grow ow-api-model">
                      ${p.model ? `<option value="${escapeHtml(p.model)}" selected>${escapeHtml(p.model)}</option>` : '<option value="">（未选择）</option>'}
                      ${(p.modelList || []).filter((m) => m !== p.model).map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('')}
                    </select>
                    <button class="ow-btn" data-action="api-pull">拉取模型</button>
                  </div>
                </div>
              </div>`).join(''));
        }
        const find = (el) => (s.api.presets || []).find((x) => x.id === $(el).closest('.ow-widget-card').data('pid'));
        $box.off('click', '[data-action="api-toggle"]').on('click', '[data-action="api-toggle"]', function () {
            const $c = $(this).closest('.ow-widget-card');
            $c.toggleClass('ow-collapsed');
            $c.find('.ow-caret i').attr('class', $c.hasClass('ow-collapsed') ? 'fa-solid fa-chevron-right' : 'fa-solid fa-chevron-down');
        });
        $box.off('input', '.ow-api-name').on('input', '.ow-api-name', function () {
            const p = find(this); if (!p) return; p.name = $(this).val(); saveSettings();
            $(this).closest('.ow-widget-card').find('.ow-widget-name').text(p.name || '未命名');
        });
        $box.off('input', '.ow-api-url').on('input', '.ow-api-url', function () { const p = find(this); if (p) { p.url = $(this).val().trim(); saveSettings(); } });
        $box.off('input', '.ow-api-key').on('input', '.ow-api-key', function () { const p = find(this); if (p) { p.key = $(this).val(); saveSettings(); } });
        $box.off('change', '.ow-api-model').on('change', '.ow-api-model', function () {
            const p = find(this); if (!p) return;
            p.model = $(this).val();
            saveSettings();
            // 立即刷新卡片右侧的模型显示（以前要退出重进才更新）
            $(this).closest('.ow-widget-card').find('.ow-widget-meta').text(p.model || '未选模型');
        });
        $box.off('click', '[data-action="api-del"]').on('click', '[data-action="api-del"]', function () {
            const p = find(this);
            if (!p || !confirm(`删除预设「${p.name}」？正在使用它的模块会回退为跟随酒馆。`)) return;
            s.api.presets = s.api.presets.filter((x) => x.id !== p.id);
            for (const k of Object.keys(s.moduleApi || {})) {
                if (s.moduleApi[k].presetId === p.id) { s.moduleApi[k].mode = 'system'; s.moduleApi[k].presetId = ''; }
            }
            saveSettings(); renderSettingsPanel($panel);
        });
        $box.off('click', '[data-action="api-pull"]').on('click', '[data-action="api-pull"]', async function () {
            const p = find(this);
            if (!p?.url) { toast('请先填写 URL', 'warning'); return; }
            const $b = $(this); $b.prop('disabled', true).text('拉取中…');
            try {
                const l = await fetchCustomModelList(p);
                toast(`拉取到 ${l.length} 个模型`, 'success');
                renderApiPresets($panel);
                // 重绘后把这张卡展开回来，免得用户还要再点一次
                const $card = $panel.find(`.ow-widget-card[data-pid="${p.id}"]`);
                $card.removeClass('ow-collapsed').find('.ow-caret i').attr('class', 'fa-solid fa-chevron-down');
            }
            catch (err) { toast(`拉取失败：${err.message || err}`, 'error'); }
            finally { $b.prop('disabled', false).text('拉取模型'); }
        });
        $panel.find('#ow_api_add').off('click').on('click', function () {
            s.api.presets = s.api.presets || [];
            s.api.presets.push({ id: `api_${Date.now().toString(36)}`, name: `预设 ${s.api.presets.length + 1}`, url: '', key: '', model: '', modelList: [] });
            saveSettings(); renderSettingsPanel($panel);
        });
    }

    /** 估算各模块当前的注入体量，帮用户判断有没有吃爆上下文 */
    function collectInjectionStats() {
        const s = settings();
        const rows = [];
        const add = (name, on, text) => rows.push({ name, on, chars: on ? String(text || '').length : 0 });
        try { add('本聊天设定', s.lore.injectEnabled, buildLoreInjectionText()); } catch (e) { /* ignore */ }
        try { add('组件结果', s.injectWidgets, s.widgets.filter((w) => w.enabled).map((w) => chatData().widgetResults[w.id]?.html).filter(Boolean).join('')); } catch (e) { /* ignore */ }
        try { add('表格', s.offscreen.enabled && s.offscreen.injectTables, renderOffscreenAsPlainText(chatData().offscreen)); } catch (e) { /* ignore */ }
        try { add('剧情推演', s.plot.injectEnabled, buildPlotInjectionText()); } catch (e) { /* ignore */ }
        try { add('历史总结', s.summary.injectEnabled, renderAllSummariesText()); } catch (e) { /* ignore */ }
        const total = rows.reduce((n, r) => n + r.chars, 0);
        return { rows, total };
    }

    function renderInjectionOverview($panel) {
        const $box = $panel.find('#ow_inject_overview');
        if (!$box.length) return;
        const { rows, total } = collectInjectionStats();
        // 粗估：中文约 1 字 ≈ 1 token，英文更省；这里只做量级参考
        const est = Math.round(total);
        const level = est > 8000 ? '#e5787d' : est > 4000 ? '#e0a458' : 'inherit';
        $box.html(`
          <table class="ow-table" style="margin-top:4px;">
            <thead><tr><th>模块</th><th>状态</th><th>字符数</th></tr></thead>
            <tbody>
              ${rows.map((r) => `<tr><td>${escapeHtml(r.name)}</td><td>${r.on ? '注入中' : '<span class="ow-muted">未注入</span>'}</td><td>${r.chars ? r.chars.toLocaleString() : '—'}</td></tr>`).join('')}
              <tr><td><b>合计</b></td><td></td><td style="color:${level};"><b>${est.toLocaleString()}</b></td></tr>
            </tbody>
          </table>
          <div class="ow-muted" style="font-size:11.5px;margin-top:4px;">中文约 1 字 ≈ 1 token，仅供量级参考。超过 4000 会标黄、8000 标红——那时建议关掉几项注入，或把总结压缩一轮。</div>`);
    }

    /** 注入深度输入框（位置统一为"聊天中"） */
    function depthRow(idPrefix, depth) {
        return `<label>深度 <input type="number" class="ow-input ow-num" id="${idPrefix}_depth" min="0" value="${depth ?? 0}"></label>
          <span class="ow-muted">数字越小越靠近最新消息</span>`;
    }

    /** 可折叠分组外壳 */
    function group(id, icon, title, bodyHtml, open = false) {
        return `
        <div class="ow-group ${open ? '' : 'ow-group-collapsed'}" data-group="${id}">
          <div class="ow-group-title" data-action="group-toggle">
            <i class="fa-solid ${icon}"></i><span>${title}</span>
            <span class="ow-spacer"></span>
            <i class="fa-solid fa-chevron-${open ? 'down' : 'right'} ow-group-caret"></i>
          </div>
          <div class="ow-group-body">${bodyHtml}</div>
        </div>`;
    }

    function renderSettingsPanel($panel) {
        const s = settings();
        const so = s.offscreen;
        const tblAuto = so.triggerMode === 'auto';
        const tblFollow = tblAuto && so.autoMode === 'follow';

        const html = [
          group('api', 'fa-plug', 'API 预设',
            `<div class="ow-muted" style="margin-bottom:6px;">维护多套 API，各模块在自己的分组里选择。Key 明文存于酒馆设置，勿在共享环境使用敏感 Key。</div>
             <div id="ow_api_presets"></div>
             <div class="ow-row"><button class="ow-btn ow-primary" id="ow_api_add">+ 新建预设</button></div>`, true),

          group('widgets', 'fa-puzzle-piece', '组件', `
            <div class="ow-field-label">生成方式</div>
            <div class="ow-row">
              <label><input type="radio" name="ow_trigger" value="manual" ${s.triggerMode === 'manual' ? 'checked' : ''}> 手动</label>
              <label><input type="radio" name="ow_trigger" value="auto" ${s.triggerMode === 'auto' ? 'checked' : ''}> 自动</label>
            </div>
            <div class="ow-sub-fields" id="ow_auto_trigger_fields" style="${s.triggerMode === 'auto' ? '' : 'display:none;'}">
              <label><input type="checkbox" id="ow_auto_content_tag" ${s.autoTriggers.onContentTag ? 'checked' : ''}> 检测到 &lt;content&gt; 闭合标签时生成</label>
              <label><input type="checkbox" id="ow_auto_widget_floor" ${s.autoTriggers.widgetsByFloor.enabled ? 'checked' : ''}> 每
                <input type="number" class="ow-input ow-num" id="ow_auto_widget_floor_n" min="1" value="${s.autoTriggers.widgetsByFloor.interval}">楼层生成一次</label>
              <label>楼层触发时回避最新
                <input type="number" class="ow-input ow-num" id="ow_floor_backoff" min="0" value="${s.autoTriggers.floorBackoff}"> 层</label>
              <div class="ow-muted" style="font-size:11.5px;">回避是为了给重 roll 留余地，组件与表格共用此设置。</div>
            </div>
            <div class="ow-field-label">上下文</div>
            <div class="ow-row"><label>获取最近 <input type="number" class="ow-input ow-num" id="ow_history_depth" min="0" value="${s.historyDepth}"> 楼聊天记录</label></div>
            ${moduleApiRow('widgets', '使用的 API')}
            <div class="ow-field-label">注入正文</div>
            <div class="ow-row">
              <label><input type="checkbox" id="ow_inject_widgets" ${s.injectWidgets ? 'checked' : ''}> 注入组件结果</label>
              ${depthRow('ow_inject', s.injectDepth)}
            </div>`),

          group('tables', 'fa-table-list', '表格', `
            <div class="ow-row"><label><input type="checkbox" id="ow_off_enabled_set" ${so.enabled ? 'checked' : ''}> 启用表格生成</label></div>
            <div class="ow-field-label">生成方式</div>
            <div class="ow-row">
              <label><input type="radio" name="ow_off_trigger" value="manual" ${!tblAuto ? 'checked' : ''}> 手动</label>
              <label><input type="radio" name="ow_off_trigger" value="auto" ${tblAuto ? 'checked' : ''}> 自动</label>
            </div>
            <div class="ow-sub-fields ${tblAuto ? '' : 'ow-disabled'}">
              <label><input type="radio" name="ow_off_automode" value="follow" ${so.autoMode === 'follow' ? 'checked' : ''} ${tblAuto ? '' : 'disabled'}> 跟随组件一起生成</label>
              <label><input type="radio" name="ow_off_automode" value="floor" ${so.autoMode === 'floor' ? 'checked' : ''} ${tblAuto ? '' : 'disabled'}> 每
                <input type="number" class="ow-input ow-num" id="ow_off_floor_n" min="1" value="${so.floorInterval}" ${tblAuto && so.autoMode === 'floor' ? '' : 'disabled'}>楼层自动生成一次</label>
            </div>
            <div class="ow-field-label">上下文</div>
            <div class="ow-row ${tblFollow ? 'ow-disabled' : ''}">
              <label>获取最近 <input type="number" class="ow-input ow-num" id="ow_off_history_depth" min="0" value="${so.historyDepth}" ${tblFollow ? 'disabled' : ''}> 楼聊天记录</label>
              ${tblFollow ? '<span class="ow-muted">已跟随组件设置</span>' : ''}
            </div>
            ${moduleApiRow('tables', '使用的 API', tblFollow, tblFollow ? '已跟随组件设置' : '')}
            <div class="ow-field-label">注入正文</div>
            <div class="ow-row">
              <label><input type="checkbox" id="ow_off_inject" ${so.injectTables ? 'checked' : ''}> 注入表格内容</label>
              ${depthRow('ow_off_inject', so.injectDepth)}
            </div>`),

          group('plot', 'fa-code-branch', '剧情推演', `
            <div class="ow-field-label">上下文</div>
            <div class="ow-row"><label>获取最近 <input type="number" class="ow-input ow-num" id="ow_plot_history" min="0" value="${s.plot.historyDepth}"> 楼聊天记录</label></div>
            <div class="ow-row"><label>至少生成 <input type="number" class="ow-input ow-num" id="ow_plot_min" min="2" value="${s.plot.minEvents}"> 个事件节点</label></div>
            <div class="ow-field-label">生成</div>
            <div class="ow-row"><label><input type="checkbox" id="ow_plot_send_current" ${s.plot.sendCurrent ? 'checked' : ''}> 生成时发送当前推演</label></div>
            <div class="ow-muted" style="font-size:11.5px;">关：重新生成全新矩阵。开：把现有矩阵发给模型续写。</div>
            ${moduleApiRow('plot', '使用的 API')}
            <div class="ow-field-label">注入正文</div>
            <div class="ow-row">
              <label><input type="checkbox" id="ow_plot_inject" ${s.plot.injectEnabled ? 'checked' : ''}> 注入当前事件与分支</label>
              ${depthRow('ow_plot_inject', s.plot.injectDepth)}
            </div>`),

          group('summary', 'fa-layer-group', '总结', `
            <div class="ow-row"><label><input type="checkbox" id="ow_sum_enabled" ${s.summary.enabled ? 'checked' : ''}> 启用总结功能</label></div>
            <div class="ow-field-label">计数方式</div>
            <div class="ow-row">
              <label><input type="radio" name="ow_sum_count" value="floor" ${s.summary.countMode !== 'chapter' ? 'checked' : ''}> 按楼层</label>
              <label><input type="radio" name="ow_sum_count" value="chapter" ${s.summary.countMode === 'chapter' ? 'checked' : ''}> 按章节标签</label>
            </div>
            <div class="ow-muted" style="font-size:11.5px;">按楼层＝用酒馆消息 ID 计数（含已隐藏楼层，隐藏旧楼层不会影响进度）。按章节＝识别正文里的 [Chapter_X] 标签。</div>
            <div class="ow-field-label">压缩</div>
            <div class="ow-row">
              <label><input type="radio" name="ow_sum_cmode" value="manual" ${s.summary.compressMode === 'manual' ? 'checked' : ''}> 手动</label>
              <label><input type="radio" name="ow_sum_cmode" value="auto" ${s.summary.compressMode === 'auto' ? 'checked' : ''}> 自动</label>
              <label>差值 <input type="number" class="ow-input ow-num" id="ow_sum_lag" min="1" value="${s.summary.compressLag}" ${s.summary.compressMode === 'auto' ? '' : 'disabled'}></label>
            </div>
            <div class="ow-muted" style="font-size:11.5px;">差值 5 = 出现第 5 次总结时压缩第 1 次，依此类推。压缩只动叙述，高光原话与物品锚点一字不改。</div>
            ${moduleApiRow('summary', '使用的 API')}
            <div class="ow-field-label">注入正文</div>
            <div class="ow-row">
              <label><input type="checkbox" id="ow_sum_inject" ${s.summary.injectEnabled ? 'checked' : ''}> 注入历史总结</label>
              ${depthRow('ow_sum_inject', s.summary.injectDepth)}
            </div>`),

          group('lore', 'fa-scroll', '设定', `
            <div class="ow-row"><label><input type="checkbox" id="ow_lore_inject" ${s.lore.injectEnabled ? 'checked' : ''}> 注入本聊天设定</label></div>
            <div class="ow-row"><label>关键词触发时向前扫描 <input type="number" class="ow-input ow-num" id="ow_lore_scan" min="1" value="${s.lore.scanDepth}"> 层</label></div>
            <div class="ow-muted" style="font-size:11.5px;">条目与各自的注入深度在「设定」标签页里管理。内容只存在当前聊天。</div>`),

          group('worldinfo', 'fa-book', '世界书', `
            <div class="ow-row">
              <label><input type="checkbox" id="ow_include_wi" ${s.includeWorldInfo ? 'checked' : ''}> 随行发送世界书 / 聊天书条目</label>
            </div>
            <div class="ow-row">
              <button class="ow-btn" id="ow_wi_refresh"><i class="fa-solid fa-rotate"></i> 刷新条目</button>
              <button class="ow-btn" id="ow_wi_reset">恢复默认</button>
              <span class="ow-muted">来源：<span id="ow_wi_book_names">—</span></span>
            </div>
            <div class="ow-muted" style="font-size:11.5px;">默认跟随条目在酒馆中的启用状态；此处改动只影响本扩展。</div>
            <div id="ow_wi_entry_list"></div>`),

          group('prompts', 'fa-pen-nib', '提示词', `<div id="ow_prompts_section"></div>`),

          group('log', 'fa-list-check', '日志', `<div id="ow_log_section"></div>`),

          group('overview', 'fa-gauge-high', '注入总览',
            `<div id="ow_inject_overview"></div><div class="ow-row"><button class="ow-btn" id="ow_inject_refresh"><i class="fa-solid fa-rotate"></i> 刷新</button></div>`),

          group('theme', 'fa-palette', '主题', `
            <div class="ow-row">
              <label><input type="radio" name="ow_theme_mode" value="system" ${s.theme.mode === 'system' ? 'checked' : ''}> 跟随酒馆</label>
              <label><input type="radio" name="ow_theme_mode" value="custom" ${s.theme.mode === 'custom' ? 'checked' : ''}> 自定义 CSS</label>
            </div>
            <div class="ow-sub-fields" id="ow_custom_theme_fields" style="${s.theme.mode === 'custom' ? '' : 'display:none;'}">
              <textarea class="ow-textarea" id="ow_theme_css" style="min-height:90px;">${escapeHtml(s.theme.customCss)}</textarea>
              <div class="ow-row"><button class="ow-btn ow-primary" id="ow_theme_save">保存并应用</button></div>
            </div>`),

          group('about', 'fa-circle-info', '关于 / 更新', `
            <div class="ow-row"><span class="ow-muted">Ego 小助手 v${EXT_VERSION}</span></div>
            <div class="ow-row">
              <a href="${REPO_URL.replace(/\.git$/, '')}" target="_blank" rel="noopener noreferrer" class="ow-btn" style="text-decoration:none;"><i class="fa-brands fa-github"></i> 仓库</a>
              <button class="ow-btn" id="ow_check_update"><i class="fa-solid fa-rotate"></i> 检查更新</button>
              <button class="ow-btn" id="ow_open_ext_manager"><i class="fa-solid fa-gear"></i> 扩展管理器</button>
              <button class="ow-btn" id="ow_diag_geometry"><i class="fa-solid fa-ruler-combined"></i> 显示诊断</button>
            </div>
            <div id="ow_update_status" class="ow-hint">尚未检查</div>`),
        ].join('');

        $panel.html(html);
        renderUpdateSection($panel);

        // 分组折叠
        $panel.off('click', '[data-action="group-toggle"]').on('click', '[data-action="group-toggle"]', function () {
            const $g = $(this).closest('.ow-group');
            $g.toggleClass('ow-group-collapsed');
            const open = !$g.hasClass('ow-group-collapsed');
            $g.find('.ow-group-caret').attr('class', `fa-solid fa-chevron-${open ? 'down' : 'right'} ow-group-caret`);
            if (open) {
                const id = $g.data('group');
                if (id === 'worldinfo') loadAndRenderWorldInfoEntries($panel);
                if (id === 'prompts') renderPromptsPanel($panel.find('#ow_prompts_section'));
                if (id === 'log') { $logPanel = $panel.find('#ow_log_section'); renderLogEntries($logPanel); }
                if (id === 'overview') renderInjectionOverview($panel);
            }
        });
        renderApiPresets($panel);

        $panel.find('#ow_lore_inject').on('change', function () { s.lore.injectEnabled = $(this).is(':checked'); saveSettings(); updateInjections(); renderInjectionOverview($panel); });
        $panel.find('#ow_lore_scan').on('change', function () { s.lore.scanDepth = Math.max(1, Number($(this).val()) || 10); saveSettings(); updateInjections(); });
        bindModuleApiRows($panel);

        $panel.find('#ow_sum_enabled').on('change', function () { s.summary.enabled = $(this).is(':checked'); saveSettings(); });
        $panel.find('input[name="ow_sum_count"]').on('change', function () {
            s.summary.countMode = $(this).val();
            saveSettings();
            if ($modal) renderSummaryPanel($modal.find('.ow-panel[data-panel="summary"]'));
        });
        $panel.find('input[name="ow_sum_cmode"]').on('change', function () { s.summary.compressMode = $(this).val(); saveSettings(); renderSettingsPanel($panel); });
        $panel.find('#ow_sum_lag').on('change', function () { s.summary.compressLag = Math.max(1, Number($(this).val()) || 5); saveSettings(); });
        $panel.find('#ow_sum_inject').on('change', function () { s.summary.injectEnabled = $(this).is(':checked'); saveSettings(); updateInjections(); });
        $panel.find('#ow_sum_inject_depth').on('change', function () { s.summary.injectDepth = Number($(this).val()) || 0; saveSettings(); updateInjections(); });

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
        $panel.find('#ow_floor_backoff').on('change', function () {
            s.autoTriggers.floorBackoff = Math.max(0, Number($(this).val()) || 0);
            saveSettings();
            renderSettingsPanel($panel);
        });
        $panel.find('#ow_auto_widget_floor_n').on('change', function () { s.autoTriggers.widgetsByFloor.interval = Math.max(1, Number($(this).val()) || 1); saveSettings(); });
        $panel.find('#ow_off_enabled_set').on('change', function () {
            s.offscreen.enabled = $(this).is(':checked');
            saveSettings();
            if ($modal) renderOffscreenPanel($modal.find('.ow-panel[data-panel="offscreen"]'));
        });
        $panel.find('input[name="ow_off_trigger"]').on('change', function () {
            s.offscreen.triggerMode = $(this).val();
            saveSettings();
            renderSettingsPanel($panel);
        });
        $panel.find('input[name="ow_off_automode"]').on('change', function () {
            s.offscreen.autoMode = $(this).val();
            saveSettings();
            renderSettingsPanel($panel);
        });
        $panel.find('#ow_off_floor_n').on('change', function () {
            s.offscreen.floorInterval = Math.max(1, Number($(this).val()) || 1);
            saveSettings();
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
        $panel.find('#ow_history_depth').on('change', function () { s.historyDepth = Math.max(0, Number($(this).val()) || 0); saveSettings(); });
        $panel.find('#ow_include_wi').on('change', function () { s.includeWorldInfo = $(this).is(':checked'); saveSettings(); });

        $panel.find('#ow_inject_widgets').on('change', function () { s.injectWidgets = $(this).is(':checked'); saveSettings(); updateInjections(); });
        $panel.find('#ow_inject_depth').on('change', function () { s.injectDepth = Number($(this).val()) || 0; saveSettings(); updateInjections(); });

        $panel.find('#ow_off_inject').on('change', function () { s.offscreen.injectTables = $(this).is(':checked'); saveSettings(); updateInjections(); });
        $panel.find('#ow_off_inject_depth').on('change', function () { s.offscreen.injectDepth = Number($(this).val()) || 0; saveSettings(); updateInjections(); });


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
