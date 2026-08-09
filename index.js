// ============================================================================
// 镜头之外 · 组件生成器 (Off-Screen & Widget Generator) for SillyTavern
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
        consoleFn(`[镜头之外][${tag}] ${msg}`, data !== undefined ? data : '');
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
            injectTables: false,
            injectPosition: 'IN_CHAT',
            injectDepth: 0,
        },
        api: { mode: 'system', url: '', key: '', model: '', modelList: [] },
        theme: { mode: 'system', customCss: '' },
        prompts: {
            widgetSystemPrompt: DEFAULT_WIDGET_SYSTEM_PROMPT,
            offscreenPreamble: DEFAULT_OFFSCREEN_PREAMBLE,
        },
        offscreenTables: defaultOffscreenTables(),
        // 世界书/聊天书发送设置：key 形如 "书名::条目uid" -> true/false（用户在本扩展内的手动覆盖）；
        // 没有覆盖记录的条目，默认发送状态跟随该条目在酒馆世界书编辑器里的"启用/禁用"开关。
        worldInfoOverrides: {},
        // 自动触发的细分开关：除了"检测到正文闭合标签"，还支持按楼层数（消息条数）独立触发
        // 组件生成与镜头之外生成，两者的间隔互不影响。
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
        return es[MODULE_NAME];
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

    // 镜头之外：默认表格定义。每张表自带"规则说明(spec)"，提示词按启用的表动态拼装，
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
            parts.push(`【已有表格数据（除"正文触发原则"要求变更的部分外，请原样保留，不要从零重写）】\n${JSON.stringify(existing)}`);
        }
        parts.push('请结合当前故事所处的时间点（季节/月份/星期/节日，从聊天记录与世界书中推断）与最新正文内容生成或更新以上表格。');
        return parts.join('\n\n');
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

    // 拉取这些世界书里的全部条目，用于设置页里的"世界书/聊天书发送设置"管理列表
    async function fetchWorldInfoEntriesForManagement() {
        const c = ctx();
        const bookNames = getBoundWorldInfoBookNames();
        const result = [];
        for (const bookName of bookNames) {
            try {
                const book = await c.loadWorldInfo(bookName);
                const entries = book?.entries ? Object.values(book.entries) : [];
                for (const e of entries) {
                    result.push({
                        book: bookName,
                        uid: String(e.uid),
                        label: e.comment || (Array.isArray(e.key) ? e.key.join('，') : '') || `条目#${e.uid}`,
                        disabledInST: !!e.disable,
                    });
                }
            } catch (err) {
                log('warn', 'system', `读取世界书「${bookName}」失败：${err.message || err}`, err);
            }
        }
        return result;
    }

    function isWorldInfoEntrySendEnabled(s, bookName, uidStr, disabledInST) {
        const key = `${bookName}::${uidStr}`;
        const override = s.worldInfoOverrides[key];
        return override !== undefined ? override : !disabledInST;
    }

    async function gatherWorldInfo() {
        const c = ctx();
        const s = settings();
        let text = '';
        try {
            const bookNames = getBoundWorldInfoBookNames();
            for (const bookName of bookNames) {
                const book = await c.loadWorldInfo(bookName);
                const entries = book?.entries ? Object.values(book.entries) : [];
                for (const e of entries) {
                    if (!isWorldInfoEntrySendEnabled(s, bookName, String(e.uid), !!e.disable)) continue;
                    const label = e.comment || (Array.isArray(e.key) ? e.key.join(',') : '条目');
                    text += `【${bookName} - ${label}】\n${e.content}\n\n`;
                }
            }
        } catch (err) {
            log('warn', 'system', `读取世界书失败：${err.message || err}`, err);
        }
        return text.trim();
    }

    function gatherCharBook() {
        const c = ctx();
        const char = c.characters?.[c.characterId];
        const book = char?.data?.character_book;
        if (!book?.entries?.length) return '';
        return book.entries
            .map((e) => `【${e.comment || (e.keys || []).join(',') || '条目'}】\n${e.content}`)
            .join('\n\n');
    }

    async function gatherExtras() {
        const s = settings();
        const extras = { history: '', worldInfo: '', charBook: '' };
        extras.history = gatherHistory(s.historyDepth);
        if (s.includeWorldInfo) extras.worldInfo = await gatherWorldInfo();
        if (s.includeCharBook) extras.charBook = gatherCharBook();
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
                console.error('[镜头之外] 组件生成失败', w.name, err);
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
        log('info', 'system', '开始生成/更新「镜头之外」内容');
        onProgress?.('offscreen', 'start');
        const extras = await gatherExtras();
        const userPrompt = buildOffscreenUserPrompt(extras);
        try {
            const raw = await callModel(buildOffscreenSystemPrompt(), userPrompt, '镜头之外');
            const parsed = tryParseJsonRobust(raw, '镜头之外');
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
                    cd.offscreen.tables[t.key] = normalizeRowsGeneric(rows, t.columns);
                    changed.push(`${t.title}(${cd.offscreen.tables[t.key].length}行)`);
                } else {
                    log('warn', 'parse', `响应中没有合法的 ${t.jsonKey} 数组（${t.title}未更新，保留旧数据）`, parsed);
                }
            }
            cd.offscreen.updatedAt = Date.now();
            saveChatData();
            log('info', 'system', `「镜头之外」更新完成：${changed.join('、') || '（无表被更新，请检查上面的 parse 警告）'}`);
            onProgress?.('offscreen', 'done');
        } catch (err) {
            log('error', 'system', `「镜头之外」生成失败：${err.message || err}`, err);
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
        if (s.offscreen.enabled) {
            try {
                await generateOffscreen({ onProgress });
            } catch (e) {
                log('warn', 'system', `「镜头之外」生成失败：${e.message || e}`);
            }
        } else {
            log('info', 'system', '"镜头之外"未启用，本次跳过。');
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

        // 触发方式一：检测正文闭合标签（命中则组件与镜头之外一起触发，行为与之前一致）
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
            if (s.offscreen.enabled && s.autoTriggers.offscreenByFloor?.enabled) {
                const interval2 = Math.max(1, Number(s.autoTriggers.offscreenByFloor.interval) || 1);
                const delta2 = currentFloor - (at.lastOffscreenFloor || 0);
                log('debug', 'trigger', `[镜头之外楼层触发] 当前楼层${currentFloor}，距上次生成已过${delta2}层，间隔设置${interval2}层`);
                if (delta2 >= interval2) {
                    log('info', 'trigger', `[镜头之外楼层触发] 达到间隔，自动生成镜头之外`);
                    try {
                        await generateOffscreen();
                        at.lastOffscreenFloor = currentFloor;
                        saveChatData();
                        refreshOpenPanels();
                    } catch (err) {
                        log('error', 'trigger', '[镜头之外楼层触发] 生成失败', err);
                        toast('按楼层自动生成镜头之外时出错，详见日志标签页', 'error');
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
        log('debug', 'inject', `更新正文注入（组件注入:${s.injectWidgets ? '开' : '关'}，镜头之外注入:${s.offscreen.enabled && s.offscreen.injectTables ? '开' : '关'}）`);
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

        // 镜头之外表格注入
        if (s.offscreen.enabled && s.offscreen.injectTables) {
            const cd = chatData();
            const text = renderOffscreenAsPlainText(cd.offscreen);
            if (text) {
                c.setExtensionPrompt(INJECT_KEY_OFFSCREEN, `[镜头之外参考信息，仅用于保持世界的连贯性，不要直接照搬描述：\n${text}]`, positionKeyToEnum(s.offscreen.injectPosition), Number(s.offscreen.injectDepth) || 0);
            } else {
                c.setExtensionPrompt(INJECT_KEY_OFFSCREEN, '', PROMPT_TYPES.IN_PROMPT, 0);
            }
        } else {
            c.setExtensionPrompt(INJECT_KEY_OFFSCREEN, '', PROMPT_TYPES.IN_PROMPT, 0);
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
            console.warn('[镜头之外] 读取预设条目失败', e);
            return [];
        }
    }

    // ------------------------------------------------------------------
    // 小工具：toast 提示
    // ------------------------------------------------------------------
    function toast(msg, type = 'info') {
        try {
            if (window.toastr && typeof window.toastr[type] === 'function') {
                window.toastr[type](msg, '镜头之外 · 组件生成器');
                return;
            }
        } catch (e) { /* ignore */ }
        console.log(`[镜头之外] ${msg}`);
    }

    // ------------------------------------------------------------------
    // UI：主弹窗
    // ------------------------------------------------------------------
    let $modal = null;

    function openModal() {
        if ($modal) { $modal.remove(); $modal = null; }
        const html = `
        <div class="ow-modal-overlay" id="ow_modal_overlay">
          <div class="ow-modal">
            <div class="ow-modal-header">
              <div class="ow-modal-title">🎬 镜头之外 · 组件生成器
                <span id="ow_generating_indicator" class="ow-generating" style="display:none;"></span>
              </div>
              <div class="ow-close-btn" id="ow_close_btn"><i class="fa-solid fa-xmark"></i></div>
            </div>
            <div class="ow-tabs">
              <div class="ow-tab active" data-tab="widgets">组件生成</div>
              <div class="ow-tab" data-tab="offscreen">镜头之外</div>
              <div class="ow-tab" data-tab="worldinfo">世界书</div>
              <div class="ow-tab" data-tab="prompts">提示词</div>
              <div class="ow-tab" data-tab="settings">设置</div>
              <div class="ow-tab" data-tab="log">日志<span class="ow-log-badge" id="ow_log_badge" style="display:none;"></span></div>
            </div>
            <div class="ow-panel active" data-panel="widgets"></div>
            <div class="ow-panel" data-panel="offscreen"></div>
            <div class="ow-panel" data-panel="worldinfo"></div>
            <div class="ow-panel" data-panel="prompts"></div>
            <div class="ow-panel" data-panel="settings"></div>
            <div class="ow-panel" data-panel="log"></div>
          </div>
        </div>`;
        $modal = $(html).appendTo(document.body);

        $modal.on('click', (e) => { if (e.target.id === 'ow_modal_overlay') closeModal(); });
        $modal.find('#ow_close_btn').on('click', closeModal);
        $modal.find('.ow-tab').on('click', function () {
            const tab = $(this).data('tab');
            $modal.find('.ow-tab').removeClass('active');
            $(this).addClass('active');
            $modal.find('.ow-panel').removeClass('active');
            $modal.find(`.ow-panel[data-panel="${tab}"]`).addClass('active');
        });

        applyTheme();
        renderWidgetsPanel($modal.find('.ow-panel[data-panel="widgets"]'));
        renderOffscreenPanel($modal.find('.ow-panel[data-panel="offscreen"]'));
        renderWorldInfoPanel($modal.find('.ow-panel[data-panel="worldinfo"]'));
        renderPromptsPanel($modal.find('.ow-panel[data-panel="prompts"]'));
        renderSettingsPanel($modal.find('.ow-panel[data-panel="settings"]'));
        $logPanel = $modal.find('.ow-panel[data-panel="log"]');
        renderLogEntries($logPanel);
        refreshGeneratingIndicator();
        log('info', 'ui', '主界面已打开');

        // 每次打开都重新检查一次更新（有缓存也无妨，请求很轻量），完成后刷新横幅/设置页状态/菜单角标
        checkExtensionUpdate().then(() => {
            if (!$modal) return;
            renderUpdateBanner($modal);
            const $panel = $modal.find('.ow-panel[data-panel="settings"]');
            if ($panel.find('#ow_update_status').length) renderUpdateSection($panel);
        });
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
            startBackgroundTask('组件与镜头之外', () => runGenerationPipeline());
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
        </div>`).appendTo(document.body);

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
    function normalizeRowsGeneric(rows, columns) {
        return rows.map((r) => {
            const out = {};
            for (const c of columns) out[c.field] = r?.[c.field] ?? r?.[c.label] ?? '';
            return out;
        });
    }

    function renderOffscreenPanel($panel) {
        const s = settings();
        const off = chatData().offscreen;
        const tables = getOffscreenTables({ onlyEnabled: true });

        let html = `
        <div class="ow-panel-bar">
          <div class="ow-row" style="margin:0;">
            <label><input type="checkbox" id="ow_off_enabled" ${s.offscreen.enabled ? 'checked' : ''}> 启用镜头之外</label>
            <button class="ow-btn ow-primary ow-gen-btn" id="ow_off_generate"><i class="fa-solid fa-wand-magic-sparkles"></i> 生成/更新</button>
            <span class="ow-muted">${off.updatedAt ? `上次更新 ${new Date(off.updatedAt).toLocaleString()}` : '尚未生成'}</span>
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

        $panel.find('#ow_off_enabled').on('change', function () {
            s.offscreen.enabled = $(this).is(':checked');
            saveSettings();
        });

        $panel.find('#ow_off_generate').on('click', function () {
            startBackgroundTask('镜头之外', () => generateOffscreen());
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
        </div>`).appendTo(document.body);

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
            $status.html('尚未检查，或检查失败——详情见"日志"标签页。可能是网络问题，或本扩展安装方式不是通过 Git 地址（无法使用酒馆内置的自动更新接口）。');
            return;
        }
        const shortHash = (updateState.currentCommitHash || '').slice(0, 7);
        if (!shortHash) {
            $status.html('未能识别为 Git 仓库（可能不是通过 Git 地址安装的，或安装目录被移动过），无法自动检查/更新，请通过酒馆「扩展」面板手动管理，或重新用仓库地址安装。');
            return;
        }
        if (updateState.isUpToDate) {
            $status.html(`✅ 已是最新版本（当前提交 ${escapeHtml(shortHash)}${updateState.currentBranchName ? `，分支 ${escapeHtml(updateState.currentBranchName)}` : ''}）`);
            updateMenuBadge();
        } else {
            $status.html(`⚠️ 发现新版本可更新（当前提交 ${escapeHtml(shortHash)}） <button class="ow-btn ow-primary" id="ow_do_update" style="margin-left:6px;">立即更新</button>`);
            $panel.find('#ow_do_update').on('click', async function () {
                const $btn = $(this);
                $btn.prop('disabled', true).text('更新中…');
                try {
                    const result = await performExtensionUpdate();
                    toast(`已更新到 ${result.shortCommitHash || '最新版本'}，需要刷新页面才能生效`, 'success');
                    if (confirm('扩展已更新完成，是否立即刷新页面以应用更新？')) {
                        location.reload();
                    } else {
                        $status.html(`✅ 已更新到 ${escapeHtml(result.shortCommitHash || '')}，请记得手动刷新页面`);
                        updateMenuBadge();
                        if ($modal) renderUpdateBanner($modal);
                    }
                } catch (err) {
                    toast(`更新失败：${err.message || err}，详见日志标签页`, 'error');
                    $btn.prop('disabled', false).text('立即更新');
                }
            });
            updateMenuBadge();
        }
    }

    // ---------------- 世界书 / 聊天书发送设置面板 ----------------
    function renderWorldInfoPanel($panel) {
        $panel.html(`
        <div class="ow-row">
          <button class="ow-btn ow-primary" id="ow_wi_refresh"><i class="fa-solid fa-rotate"></i> 拉取/刷新条目列表</button>
          <button class="ow-btn" id="ow_wi_reset">全部恢复默认（跟随酒馆启用状态）</button>
        </div>
        <div class="ow-hint">来源：<span id="ow_wi_book_names">—</span><br>默认跟随条目在酒馆中的启用状态；此处改动只影响本扩展，不改酒馆世界书。需在「设置 → 上下文」勾选后生效。</div>
        <div id="ow_wi_entry_list"></div>`);

        $panel.find('#ow_wi_refresh').on('click', () => loadAndRenderWorldInfoEntries($panel));
        $panel.find('#ow_wi_reset').on('click', () => {
            if (!confirm('确定清空所有手动覆盖，恢复为"跟随酒馆启用状态"吗？')) return;
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
        const bookNames = getBoundWorldInfoBookNames();
        $panel.find('#ow_wi_book_names').text(bookNames.length ? bookNames.join('、') : '（未识别到任何已激活的世界书/聊天书）');
        if (!bookNames.length) {
            $list.html('<div class="ow-empty">当前没有识别到激活的世界书，也没有绑定聊天书。请先在酒馆的"世界书"面板里勾选要启用的世界书，或为当前聊天绑定聊天书。</div>');
            return;
        }
        const entries = await fetchWorldInfoEntriesForManagement();
        log('debug', 'system', `世界书管理列表拉取到 ${entries.length} 条条目，来自 ${bookNames.length} 本书`, bookNames);
        if (!entries.length) {
            $list.html('<div class="ow-empty">识别到的世界书里没有任何条目。</div>');
            return;
        }
        const byBook = {};
        for (const e of entries) (byBook[e.book] = byBook[e.book] || []).push(e);

        let html = '';
        for (const [book, list] of Object.entries(byBook)) {
            html += `<div class="ow-section-title">${escapeHtml(book)}</div>`;
            for (const e of list) {
                const checked = isWorldInfoEntrySendEnabled(s, e.book, e.uid, e.disabledInST);
                html += `<div class="ow-preset-entry" style="padding:4px 0;">
                    <input type="checkbox" class="ow-wi-entry-toggle" data-book="${escapeHtml(e.book)}" data-uid="${escapeHtml(e.uid)}" ${checked ? 'checked' : ''}>
                    <label>${escapeHtml(e.label)}${e.disabledInST ? ' <span class="ow-muted">（在酒馆中已禁用）</span>' : ''}</label>
                </div>`;
            }
        }
        $list.html(html);
        $list.off('change', '.ow-wi-entry-toggle').on('change', '.ow-wi-entry-toggle', function () {
            const book = $(this).data('book');
            const uidStr = String($(this).data('uid'));
            s.worldInfoOverrides[`${book}::${uidStr}`] = $(this).is(':checked');
            saveSettings();
        });
    }

    // ---------------- 提示词面板 ----------------
    function renderPromptsPanel($panel) {
        const s = settings();
        $panel.html(`
        <div class="ow-hint">编辑即保存。</div>

        <div class="ow-section-title">组件生成提示词</div>
        <div class="ow-row"><button class="ow-btn" id="ow_prompt_widget_reset">恢复默认</button></div>
        <textarea class="ow-textarea" id="ow_prompt_widget" style="min-height:220px;">${escapeHtml(s.prompts.widgetSystemPrompt)}</textarea>

        <div class="ow-section-title">镜头之外 · 总则</div>
        <div class="ow-hint">各表自己的规则写在「镜头之外 → 表格管理」里，这里只放总则；实际发送时会自动拼上启用表格的规则与 JSON 格式说明。</div>
        <div class="ow-row"><button class="ow-btn" id="ow_prompt_offscreen_reset">恢复默认</button></div>
        <textarea class="ow-textarea" id="ow_prompt_offscreen" style="min-height:240px;">${escapeHtml(s.prompts.offscreenPreamble)}</textarea>

        <div class="ow-section-title">实际发送的完整提示词（预览）</div>
        <div class="ow-row"><button class="ow-btn" id="ow_prompt_preview_btn">生成预览</button></div>
        <pre id="ow_prompt_preview" class="ow-preview-box" style="display:none;"></pre>`);

        $panel.find('#ow_prompt_widget').on('input', function () {
            s.prompts.widgetSystemPrompt = $(this).val();
            saveSettings();
        });
        $panel.find('#ow_prompt_widget_reset').on('click', function () {
            if (!confirm('确定恢复"组件生成提示词"为默认内容吗？当前编辑内容会被覆盖。')) return;
            s.prompts.widgetSystemPrompt = DEFAULT_WIDGET_SYSTEM_PROMPT;
            saveSettings();
            renderPromptsPanel($panel);
        });

        $panel.find('#ow_prompt_offscreen').on('input', function () {
            s.prompts.offscreenPreamble = $(this).val();
            saveSettings();
        });
        $panel.find('#ow_prompt_preview_btn').on('click', function () {
            const $box = $panel.find('#ow_prompt_preview');
            $box.text(buildOffscreenSystemPrompt()).toggle();
        });
        $panel.find('#ow_prompt_offscreen_reset').on('click', function () {
            if (!confirm('确定恢复"镜头之外总则"为默认内容吗？当前编辑内容会被覆盖。')) return;
            s.prompts.offscreenPreamble = DEFAULT_OFFSCREEN_PREAMBLE;
            saveSettings();
            renderPromptsPanel($panel);
        });
    }

    function renderSettingsPanel($panel) {
        const s = settings();
        const posOptions = (sel) => `
            <option value="IN_PROMPT" ${sel === 'IN_PROMPT' ? 'selected' : ''}>提示词顶部</option>
            <option value="IN_CHAT" ${sel === 'IN_CHAT' ? 'selected' : ''}>聊天记录中（按深度）</option>
            <option value="BEFORE_PROMPT" ${sel === 'BEFORE_PROMPT' ? 'selected' : ''}>提示词最前</option>`;
        const html = `
        <div class="ow-section-title">触发</div>
        <div class="ow-row">
          <label><input type="radio" name="ow_trigger" value="manual" ${s.triggerMode === 'manual' ? 'checked' : ''}> 手动</label>
          <label><input type="radio" name="ow_trigger" value="auto" ${s.triggerMode === 'auto' ? 'checked' : ''}> 自动</label>
        </div>
        <div class="ow-col" id="ow_auto_trigger_fields" style="${s.triggerMode === 'auto' ? '' : 'display:none;'} padding-left:12px;">
          <label><input type="checkbox" id="ow_auto_content_tag" ${s.autoTriggers.onContentTag ? 'checked' : ''}> 检测到 &lt;content&gt; 闭合标签时生成</label>
          <label><input type="checkbox" id="ow_auto_widget_floor" ${s.autoTriggers.widgetsByFloor.enabled ? 'checked' : ''}> 组件每
            <input type="number" class="ow-input" id="ow_auto_widget_floor_n" style="width:56px;margin:0 4px;" min="1" value="${s.autoTriggers.widgetsByFloor.interval}">楼层生成</label>
          <label><input type="checkbox" id="ow_auto_offscreen_floor" ${s.autoTriggers.offscreenByFloor.enabled ? 'checked' : ''}> 镜头之外每
            <input type="number" class="ow-input" id="ow_auto_offscreen_floor_n" style="width:56px;margin:0 4px;" min="1" value="${s.autoTriggers.offscreenByFloor.interval}">楼层生成</label>
        </div>

        <div class="ow-section-title">上下文</div>
        <div class="ow-row">
          <label>随行发送最近
            <input type="number" class="ow-input" id="ow_history_depth" style="width:60px;margin:0 6px;" min="0" value="${s.historyDepth}">条聊天记录</label>
        </div>
        <div class="ow-row">
          <label><input type="checkbox" id="ow_include_wi" ${s.includeWorldInfo ? 'checked' : ''}> 世界书条目（在「世界书」页选择）</label>
          <label><input type="checkbox" id="ow_include_cb" ${s.includeCharBook ? 'checked' : ''}> 角色卡内嵌世界书</label>
        </div>

        <div class="ow-section-title">注入正文</div>
        <div class="ow-row">
          <label style="min-width:80px;"><input type="checkbox" id="ow_inject_widgets" ${s.injectWidgets ? 'checked' : ''}> 组件</label>
          <select class="ow-select" id="ow_inject_pos">${posOptions(s.injectPosition)}</select>
          深度<input type="number" class="ow-input" id="ow_inject_depth" style="width:56px;" min="0" value="${s.injectDepth}">
        </div>
        <div class="ow-row">
          <label style="min-width:80px;"><input type="checkbox" id="ow_off_inject" ${s.offscreen.injectTables ? 'checked' : ''}> 表格</label>
          <select class="ow-select" id="ow_off_inject_pos">${posOptions(s.offscreen.injectPosition)}</select>
          深度<input type="number" class="ow-input" id="ow_off_inject_depth" style="width:56px;" min="0" value="${s.offscreen.injectDepth}">
        </div>

        <div class="ow-section-title">API</div>
        <div class="ow-row">
          <label><input type="radio" name="ow_api_mode" value="system" ${s.api.mode === 'system' ? 'checked' : ''}> 跟随酒馆</label>
          <label><input type="radio" name="ow_api_mode" value="custom" ${s.api.mode === 'custom' ? 'checked' : ''}> 独立 API</label>
        </div>
        <div class="ow-col" id="ow_custom_api_fields" style="${s.api.mode === 'custom' ? '' : 'display:none;'} padding-left:12px;">
          <input type="text" class="ow-input" id="ow_api_url" placeholder="URL，如 https://api.openai.com/v1" value="${escapeHtml(s.api.url)}">
          <input type="password" class="ow-input" id="ow_api_key" placeholder="API Key" value="${escapeHtml(s.api.key)}">
          <div class="ow-row">
            <select class="ow-select ow-grow" id="ow_api_model">
              ${s.api.model ? `<option value="${escapeHtml(s.api.model)}" selected>${escapeHtml(s.api.model)}</option>` : ''}
              ${(s.api.modelList || []).filter((m) => m !== s.api.model).map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('')}
            </select>
            <button class="ow-btn" id="ow_api_pull_models">拉取模型</button>
          </div>
          <div class="ow-hint">填写即保存。Key 以明文存于酒馆设置，勿在共享环境使用敏感 Key。</div>
        </div>

        <div class="ow-section-title">主题</div>
        <div class="ow-row">
          <label><input type="radio" name="ow_theme_mode" value="system" ${s.theme.mode === 'system' ? 'checked' : ''}> 跟随酒馆</label>
          <label><input type="radio" name="ow_theme_mode" value="custom" ${s.theme.mode === 'custom' ? 'checked' : ''}> 自定义 CSS</label>
        </div>
        <div class="ow-col" id="ow_custom_theme_fields" style="${s.theme.mode === 'custom' ? '' : 'display:none;'} padding-left:12px;">
          <textarea class="ow-textarea" id="ow_theme_css" style="min-height:90px;" placeholder=".ow-modal { }">${escapeHtml(s.theme.customCss)}</textarea>
          <div class="ow-row"><button class="ow-btn ow-primary" id="ow_theme_save">保存并应用</button></div>
        </div>

        <div class="ow-section-title">关于 / 更新</div>
        <div class="ow-row">
          <a href="${REPO_URL.replace(/\.git$/, '')}" target="_blank" rel="noopener noreferrer" class="ow-btn" style="text-decoration:none;">
            <i class="fa-brands fa-github"></i> 仓库
          </a>
          <button class="ow-btn" id="ow_check_update"><i class="fa-solid fa-rotate"></i> 检查更新</button>
        </div>
        <div id="ow_update_status" class="ow-hint">尚未检查</div>
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
            <span>镜头之外 / 组件生成</span>
            <span id="ow_menu_update_badge" class="ow-log-badge" style="display:none;" title="有新版本可更新">NEW</span>
          </div>`);
        $('#extensionsMenu').append($btn);
        $btn.on('click', openModal);
        updateMenuBadge();
    }

    function waitForMenu(retries = 30) {
        if ($('#extensionsMenu').length) { addMenuButton(); return; }
        if (retries <= 0) { console.warn('[镜头之外] 未找到 #extensionsMenu，扩展入口未挂载'); return; }
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
