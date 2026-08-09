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
    };

    async function checkExtensionUpdate({ quiet = false } = {}) {
        if (updateState.checking) return updateState;
        updateState.checking = true;
        try {
            const c = ctx();
            const headers = c.getRequestHeaders ? c.getRequestHeaders() : { 'Content-Type': 'application/json' };
            const res = await fetch('/api/extensions/version', {
                method: 'POST',
                headers,
                body: JSON.stringify({ extensionName: EXTENSION_ID_PARAM, global: false }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            updateState.checked = true;
            updateState.isUpToDate = !!data.isUpToDate;
            updateState.currentCommitHash = data.currentCommitHash || '';
            updateState.currentBranchName = data.currentBranchName || '';
            updateState.remoteUrl = data.remoteUrl || '';
            if (!quiet) {
                log('info', 'system', `扩展更新检查完成：${updateState.isUpToDate ? '已是最新版本' : '发现新版本'}（本地提交 ${updateState.currentCommitHash.slice(0, 7) || '未知'}）`, data);
            }
        } catch (err) {
            log('warn', 'system', `检查扩展更新失败：${err.message || err}（extensionName=${EXTENSION_ID_PARAM}，若本扩展安装目录名与仓库名不同，可能需要在代码里调整回退值）`, err);
        } finally {
            updateState.checking = false;
            updateMenuBadge();
        }
        return updateState;
    }

    async function performExtensionUpdate() {
        const c = ctx();
        log('info', 'system', `开始从仓库拉取扩展更新（extensionName=${EXTENSION_ID_PARAM}）…`);
        const headers = c.getRequestHeaders ? c.getRequestHeaders() : { 'Content-Type': 'application/json' };
        const res = await fetch('/api/extensions/update', {
            method: 'POST',
            headers,
            body: JSON.stringify({ extensionName: EXTENSION_ID_PARAM, global: false }),
        });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(`HTTP ${res.status} ${text.slice(0, 200)}`);
        }
        const data = await res.json();
        log('info', 'system', '扩展更新请求完成', data);
        // 注意：/update 接口返回的 isUpToDate 表示"拉取前"是否已是最新（false = 刚刚真的拉取了新代码）
        updateState.checked = true;
        updateState.isUpToDate = true; // 拉取动作本身已让本地追平远端
        if (data.shortCommitHash) updateState.currentCommitHash = data.shortCommitHash;
        updateMenuBadge();
        return data; // { isUpToDate, shortCommitHash, extensionPath, remoteUrl }
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
            offscreenSystemPrompt: DEFAULT_OFFSCREEN_SYSTEM_PROMPT,
        },
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
        const emptyOffscreen = () => ({
            scheduleTable: [], characterTable: [], sceneTable: [], itemAnchorTable: [],
            timelineTable: [], foreshadowTable: [], updatedAt: null,
        });
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
        // 兼容旧版本存档结构（曾经有 narrative/event_table 字段，或缺少新表）
        if (!Array.isArray(off.sceneTable)) off.sceneTable = [];
        if (!Array.isArray(off.itemAnchorTable)) off.itemAnchorTable = [];
        if (!Array.isArray(off.timelineTable)) off.timelineTable = [];
        if (!Array.isArray(off.foreshadowTable)) off.foreshadowTable = [];
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

    // 镜头之外：六张表的说明（不使用"表X"编号标识，仅用表名）。
    // 场景表 / 物品轨迹表严格遵循"正文触发原则"；角色表不受此原则约束；
    // 日程表沿用自身原有的、允许合理推断的规则；核心待办事项表与伏笔表各自的
    // 增删规则相互独立，不共用同一套清理标准。
    const DEFAULT_OFFSCREEN_TABLE_SPEC = `
# 总原则（务必先读）
- "正文触发原则"仅适用于【场景表】与【物品轨迹表】：
  · 正文中明确描写了变化 → 允许更新对应表格字段。
  · 正文中未提及 → 必须原样保留上一版对应条目的所有字段，一字不改地照抄，不允许新增/删除/修改。
  · 禁止基于逻辑推理、默认进程、或"应该发生了"而主动修改这两张表的状态。
- 【角色表】不需要遵守"正文触发原则"，可以合理描写正文中不在场角色目前应该在做的事。
- 【日程表】遵循自己小节内的规则（允许基于身份与时间点做合理推断/弹性填充），同样不受"正文触发原则"约束。
- 六张表各自的生命周期（新增/更新/删除时机）互不相同、不共用一套标准，严格按各表小节内注明的规则执行，不要把某张表的清理逻辑套用到另一张表上。
- 所有带编号的标签字段，输出时必须整体带上反引号"\`"符号，例如 \`[Scene_1]\`、\`[Item_Anchor_1]\`、\`[Chapter_1]\`、\`[Foreshadow_1]\`。

## 日程表
列结构：角色 | 固定日程规律 | 时节性必然事件 | 弹性事务参考池
本表只记录正文中尚未提及的角色日常生活信息。记录两类内容：因身份而必然存在的规律性/时节性事务，
以及供离场角色抽取参考的弹性生活素材，均由"身份+当前故事时间点"自然推导得出。
"固定日程规律"：日常性、按周期反复发生的日程锚点，含具体星期与时段。
"时节性必然事件"：结合角色身份与当前故事日期所处季节/月份/节日/星期推导出的大概率事务，写法为"时间节点：事务"，无关联时留空"—"。
"弹性事务参考池"：与角色身份/性格相符、结合当前季节/星期/天气合理存在的偶发小事清单，用中文分号分隔多项，不要求真实发生过。
时节性事件时间窗口过去后应删除（下次进入类似节点可重新生成）；固定日程规律与弹性事务参考池仅在角色身份根本变化时整体更新。

## 角色表
列结构：姓名 | 昵称 | 与用户的关系 | 当前位置与正在做的事 | 对用户的态度
记录所有已出场角色的身份信息与实时状态，确保离场角色也拥有可查证的当前生活状态。
"当前位置与正在做的事"：绝对上帝视角的物理位置与客观动作，不带情绪与内心活动，禁止写"未知"。
"对用户的态度"：用2-3个简写标签描述当前状态快照。
不删除，永久保留，即使角色长期不出场也不清理；每次更新都应覆盖"当前位置与正在做的事"字段。

## 场景表
1. 收录标准：仅收录具备明确功能或剧情停留价值的室内/室外固定场所。不收录通道类，如马路、街道、走廊、过道、楼梯间。不收录建筑附属部件，如门、窗、墙（作为整体建筑的一部分即可，无需拆分"东门西门"）。不收录未发生任何剧情对话或动作的经过性地点。每次生成如发现之前收录过的条目不符合以上标准，请在此条中立即删除。
2. 基本原则：做加法，不做覆盖。同一场景再次出现时，若正文补充了新细节，追加到对应字段。仅当同一特征出现前后矛盾的描写时，以最新描写为准，并删除旧内容。
3. 失活清理规则（维护动作，不算脑补剧情变化，因此不受"正文触发原则"约束）：若某场景标签连续10章未在正文中出现，且当前"核心待办事项表"与"伏笔表"中均无条目指向该场景，下次生成场景表时直接删除该行，不需要正文给出"这个场景被放弃"的描写作为触发依据。若10章内再次出现或被其他表引用，则保留，计数清零重新计算。
4. \`[Scene_X]\`：场景标签。X为阿拉伯数字，按场景首次出场顺序从1开始递增。
5. 场景名称：只写一层整体空间，如"A的公寓""街角咖啡馆"。
6. 地理位置/距离参照：参照物可用场景标签或通用地标。
7. 建筑/环境构造细节：仅记录正文明确描写的客观物理存在。禁止写入依赖特定时间、天气、氛围的感官评价（如"灯光昏暗"）。当需要注明子空间时，在该字段内以"功能区：具体客观陈设"的格式追加，如："卧室：有一张双人床、嵌入式衣柜。"
8. 用途：仅写正文中明确提及或被角色行为证实的绝对物理化用途（"A的住所""A常在此喝咖啡"）。禁止写功能性用途（"施压用场景"）。
9. 未描写皆可为空，禁止想象、脑补。

## 物品轨迹表
1. 收录标准，仅收录满足以下任一条件的物品，其余物品一律不收录：
   - 纪念意义：角色主动赠予、留存、珍藏的物品，或与角色重大过去强关联的信物。
   - 剧情杠杆：对后文剧情发展可能产生关键影响的物品。
   - 禁止收录手机，除非离开主人身边。如看到不合规的手机项，请在此条中立刻删掉。
2. 终态判定（决定是否删除，两类物品判定标准不同）：
   - 剧情杠杆类：该物品所关联的剧情段落明确结束后，下一轮删除该行。
   - 纪念意义类：不因单段剧情结束而自动删除，仅当正文明确描写了不可逆的处置动作（被清走、被烧毁、被永久赠予且对方已带离场景、被明确证实无法找回）时，才视为终态，下一轮删除。若正文只描写了"扔进垃圾桶/藏起来/丢在某处"但未描写后续被清走或彻底销毁，视为"可逆位置"，继续保留追踪，位置字段照实填写当前所在处，不判定删除。
3. \`[Item_Anchor_X]\`：物品编号标签。X为阿拉伯数字，按物品首次出场顺序从1开始递增。每个物品终身固定此标签，不可变更。
4. 物品名称：必须包含可辨识的描述性特征，以便区分同类物品。当物品为虚拟物品，如照片、文件等，需要写清它的上一级物品，如"有着XX照片的XX的手机"，位置为手机的位置。
5. 关联章节：该物品首次出现和移动的章节标签\`[Chapter_X]\`，可为多个（用顿号或逗号分隔）。
6. 当前位置：记录物品此刻所在的绝对位置。角色持有写"A的口袋""B的手中"；场景内位置写"A书房抽屉\`[Scene_1]\`"。禁止自创场景标签，只能引用场景表中已存在的\`[Scene_X]\`标签。
7. 状态：根据第2条终态判定，标注"留存"或"待删（下轮删除）"。

## 核心待办事项表
1. 收录范围：此表只追踪"尚未开始"的待办事项。一旦该事项在正文中开始发生（无论是持续几章还是持续几十章的长事件，如一场旅行），下一轮生成时立即将该行整行删除——事项进行中及之后的发展由正文本身、场景表、角色表自然承载，不再需要本表追踪，避免长事件反复累积关联章节标签。
2. 更新原则：严格根据上一轮的待办表和本章新正文进行更新。若正文未推进任何待办进度，则完全继承旧表，不许妄动。
3. 时间：必须对应到确切的日期与时间节点（例如：2023.11.06 14:00）。绝对禁止使用模糊表述（如"下周""明天""两个小时后"）。若无具体的时分刻度，必须填写"待定"或"全天"。
4. 事项：简写清楚具体的任务或事件。
5. 关联章节：只记录该事项**首次被提及/确立**的那一个章节标签\`[Chapter_X]\`，不随事项被反复提起而追加新标签——保留这一条是为了防止事项在很多章之前被提到过一次后就被遗忘，回看这一个标签即可定位起点。

## 伏笔表
1. 收录标准：正文中出现的、尚未解释清楚的异常细节、隐藏信息、角色未说明的反常举动或态度，均可收录。
2. 更新原则：只在正文明确埋下新伏笔时新增，只在正文明确回收（谜底揭晓/信息被说明）时将状态改为"已回收"，已回收的伏笔在下一轮生成时整行删除。不因时间推移或长期未提及而清理——伏笔的价值就在于"很久不提也不能忘"，不受场景表那类失活清理规则约束。
3. \`[Foreshadow_X]\`：伏笔标签。X为阿拉伯数字，按伏笔首次出现顺序从1开始递增。
4. 内容：简要描述伏笔本身，需能让人一眼回忆起是什么事，不写"某某很奇怪"这类无信息量的记录。
5. 埋设章节：该伏笔首次出现的章节标签\`[Chapter_X]\`。
6. 状态：仅限"未回收""已回收"，已回收的行下一轮删除。

## 关于"章节标签 \`[Chapter_X]\`"的说明
若当前故事本身没有明确的"第X章"式章节划分，请你自行以连续递增的编号维护一套章节标签体系
（例如可以按剧情自然段落划分），只要求前后编号保持一致、不重新编号已经分配过的章节即可，
不强制要求与任何外部章节系统对齐。
`.trim();

    const DEFAULT_OFFSCREEN_SYSTEM_PROMPT =
        '你是一个为角色扮演故事维护"镜头之外"状态数据库的助手。你需要维护六张结构化表格，方便用户直接查看与编辑。' +
        '这些内容绝不能与正文已经确认的剧情冲突，也不能提前揭示正文尚未发生、但即将由用户或主角亲自经历的关键转折。\n\n' +
        '维护规则如下：\n' + DEFAULT_OFFSCREEN_TABLE_SPEC + '\n\n' +
        '请仅输出一个 JSON 对象，不要输出任何 Markdown 代码块围栏或解释文字，结构必须是：\n' +
        '{"schedule_table":[{"role":"","routine":"","seasonal":"","pool":""}],' +
        '"character_table":[{"name":"","alias":"","relation":"","location":"","attitude":""}],' +
        '"scene_table":[{"tag":"`[Scene_1]`","name":"","location":"","structure":"","usage":""}],' +
        '"item_anchor_table":[{"tag":"`[Item_Anchor_1]`","name":"","chapters":"","location":"","status":""}],' +
        '"timeline_table":[{"time":"","task":"","chapter":"`[Chapter_1]`"}],' +
        '"foreshadow_table":[{"tag":"`[Foreshadow_1]`","content":"","chapter":"`[Chapter_1]`","status":"未回收"}]}\n' +
        '六张表都需要在已有表格数据的基础上按各自小节的规则更新（新增/修改/按规则删除），而不是每次全部推倒重写；' +
        '未被规则要求变更的表格或行，请原样保留上一版数据。';

    function buildOffscreenUserPrompt(extras) {
        const parts = [];
        if (extras.history) parts.push(`【最近聊天记录】\n${extras.history}`);
        if (extras.worldInfo) parts.push(`【世界书参考】\n${extras.worldInfo}`);
        if (extras.charBook) parts.push(`【角色卡内嵌世界书参考】\n${extras.charBook}`);
        const existing = chatData().offscreen;
        const hasExisting = ['scheduleTable', 'characterTable', 'sceneTable', 'itemAnchorTable', 'timelineTable', 'foreshadowTable']
            .some((k) => existing[k]?.length);
        if (hasExisting) {
            parts.push(`【已有表格数据（除"正文触发原则"要求变更的部分外，请原样保留，不要从零重写）】\n${JSON.stringify({
                schedule_table: existing.scheduleTable,
                character_table: existing.characterTable,
                scene_table: existing.sceneTable,
                item_anchor_table: existing.itemAnchorTable,
                timeline_table: existing.timelineTable,
                foreshadow_table: existing.foreshadowTable,
            })}`);
        }
        parts.push('请结合当前故事所处的时间点（季节/月份/星期/节日，从聊天记录与世界书中推断）与最新正文内容生成或更新以上六张表。');
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
            const raw = await callModel(settings().prompts.offscreenSystemPrompt, userPrompt, '镜头之外');
            const parsed = tryParseJsonRobust(raw, '镜头之外');
            if (!parsed) {
                throw new Error('未能从模型响应中解析出 JSON，表格因此没有更新。请在「日志」标签页查看完整响应内容，确认模型是否遵循了 JSON 格式要求。');
            }
            if (typeof parsed !== 'object' || Array.isArray(parsed)) {
                throw new Error(`解析出的内容不是预期的对象结构（实际类型：${Array.isArray(parsed) ? 'array' : typeof parsed}）`);
            }
            const cd = chatData();
            let changed = [];
            const applyTable = (jsonKey, storeKey, label, normalizeFn) => {
                if (Array.isArray(parsed[jsonKey])) {
                    cd.offscreen[storeKey] = normalizeFn(parsed[jsonKey]);
                    changed.push(`${label}(${cd.offscreen[storeKey].length}行)`);
                } else {
                    log('warn', 'parse', `响应 JSON 中没有找到合法的 ${jsonKey} 数组字段（${label}未更新，本轮保留旧数据）`, parsed);
                }
            };
            applyTable('schedule_table', 'scheduleTable', '日程表', normalizeScheduleRows);
            applyTable('character_table', 'characterTable', '角色表', normalizeCharacterRows);
            applyTable('scene_table', 'sceneTable', '场景表', normalizeSceneRows);
            applyTable('item_anchor_table', 'itemAnchorTable', '物品轨迹表', normalizeItemAnchorRows);
            applyTable('timeline_table', 'timelineTable', '核心待办事项表', normalizeTimelineRows);
            applyTable('foreshadow_table', 'foreshadowTable', '伏笔表', normalizeForeshadowRows);
            cd.offscreen.updatedAt = Date.now();
            saveChatData();
            log('info', 'system', `「镜头之外」更新完成，已写入 chatMetadata.${MODULE_NAME}.offscreen：${changed.join('、') || '（无字段被更新，请检查上面的 parse 警告）'}`);
            onProgress?.('offscreen', 'done');
        } catch (err) {
            log('error', 'system', `「镜头之外」生成失败：${err.message || err}`, err);
            onProgress?.('offscreen', 'error', err);
            throw err;
        }
        updateInjections();
    }

    // 兼容模型可能使用的不同字段名（中文/拼音/英文），尽量把返回内容对齐到内部统一字段
    function normalizeScheduleRows(rows) {
        return rows.map((r) => ({
            role: r.role ?? r.角色 ?? r.name ?? '',
            routine: r.routine ?? r.固定日程规律 ?? r.fixed_schedule ?? '',
            seasonal: r.seasonal ?? r.时节性必然事件 ?? r.seasonal_event ?? '',
            pool: r.pool ?? r.弹性事务参考池 ?? r.flexible_pool ?? '',
        }));
    }
    function normalizeCharacterRows(rows) {
        return rows.map((r) => ({
            name: r.name ?? r.姓名 ?? '',
            alias: r.alias ?? r.昵称 ?? r.nickname ?? '',
            relation: r.relation ?? r.关系 ?? r['与用户的关系'] ?? '',
            location: r.location ?? r.当前位置与正在做的事 ?? r.status ?? '',
            attitude: r.attitude ?? r.态度 ?? r['对用户的态度'] ?? '',
        }));
    }
    function normalizeSceneRows(rows) {
        return rows.map((r) => ({
            tag: r.tag ?? r.标签 ?? r['Scene标签'] ?? '',
            name: r.name ?? r.场景名称 ?? '',
            location: r.location ?? r['地理位置/距离参照'] ?? r.地理位置 ?? '',
            structure: r.structure ?? r['建筑/环境构造细节'] ?? r.构造细节 ?? '',
            usage: r.usage ?? r.用途 ?? '',
        }));
    }
    function normalizeItemAnchorRows(rows) {
        return rows.map((r) => ({
            tag: r.tag ?? r.标签 ?? '',
            name: r.name ?? r.物品名称 ?? '',
            chapters: r.chapters ?? r.关联章节 ?? '',
            location: r.location ?? r.当前位置 ?? '',
            status: r.status ?? r.状态 ?? '',
        }));
    }
    function normalizeTimelineRows(rows) {
        return rows.map((r) => ({
            time: r.time ?? r.时间 ?? '',
            task: r.task ?? r.事项 ?? '',
            chapter: r.chapter ?? r.关联章节 ?? '',
        }));
    }
    function normalizeForeshadowRows(rows) {
        return rows.map((r) => ({
            tag: r.tag ?? r.标签 ?? '',
            content: r.content ?? r.内容 ?? '',
            chapter: r.chapter ?? r.埋设章节 ?? '',
            status: r.status ?? r.状态 ?? '未回收',
        }));
    }

    async function runGenerationPipeline(onProgress) {
        log('info', 'system', '=== 开始批量生成流程 ===');
        await generateAllWidgets({ onProgress });
        const s = settings();
        if (s.offscreen.enabled) {
            try {
                await generateOffscreen({ onProgress });
            } catch (e) {
                toast(`「镜头之外」生成失败：${e.message || e}，详情请看日志标签页`, 'error');
            }
        } else {
            log('info', 'system', '"镜头之外"当前未启用（设置页 / 镜头之外标签页里的开关），本次批量生成跳过了它。若你希望它随组件一起生成，请先勾选"启用镜头之外"。');
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
        if (off.scheduleTable?.length) {
            parts.push('日程表：\n' + off.scheduleTable.map((r) => `- ${r.role}｜${r.routine || '—'}｜${r.seasonal || '—'}｜${r.pool || '—'}`).join('\n'));
        }
        if (off.characterTable?.length) {
            parts.push('角色表：\n' + off.characterTable.map((r) => `- ${r.name}（${r.alias || '—'}）｜关系:${r.relation || '—'}｜${r.location || '—'}｜态度:${r.attitude || '—'}`).join('\n'));
        }
        if (off.sceneTable?.length) {
            parts.push('场景表：\n' + off.sceneTable.map((r) => `- ${r.tag} ${r.name}｜${r.location || '—'}｜${r.structure || '—'}｜${r.usage || '—'}`).join('\n'));
        }
        if (off.itemAnchorTable?.length) {
            parts.push('物品轨迹表：\n' + off.itemAnchorTable.map((r) => `- ${r.tag} ${r.name}｜${r.chapters || '—'}｜${r.location || '—'}｜${r.status || '—'}`).join('\n'));
        }
        if (off.timelineTable?.length) {
            parts.push('核心待办事项表：\n' + off.timelineTable.map((r) => `- ${r.time}｜${r.task}｜${r.chapter || '—'}`).join('\n'));
        }
        if (off.foreshadowTable?.length) {
            parts.push('伏笔表：\n' + off.foreshadowTable.map((r) => `- ${r.tag} ${r.content}｜${r.chapter || '—'}｜${r.status || '未回收'}`).join('\n'));
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
              <div class="ow-modal-title">🎬 镜头之外 · 组件生成器</div>
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
          <span class="ow-muted">日志仅保存在本次页面会话的内存中，刷新页面会清空；出问题时请复制后发给开发者对照排查。</span>
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
        <div class="ow-row">
          <button class="ow-btn ow-primary" id="ow_generate_now"><i class="fa-solid fa-wand-magic-sparkles"></i> 立即生成全部已开启组件</button>
          <span class="ow-muted">当前触发模式：${s.triggerMode === 'auto' ? '自动（检测到新正文自动生成）' : '手动'}，可在“设置”中修改；生成过程详情见“日志”标签页</span>
        </div>

        <div class="ow-section-title">① 组件显示（API 返回的渲染结果）</div>
        <div id="ow_widget_results"></div>

        <div class="ow-section-title" style="margin-top:20px;">② 组件列表（新建 / 编辑 / 勾选预设条目）</div>
        <div class="ow-row">
          <button class="ow-btn ow-primary" id="ow_add_widget"><i class="fa-solid fa-plus"></i> 新建组件</button>
        </div>
        <div id="ow_widget_list"></div>`);

        renderWidgetResults($panel);
        renderWidgetList($panel);

        $panel.find('#ow_add_widget').on('click', () => {
            s.widgets.push({ id: uid(), name: '新组件', prompt: '', enabled: true, presetEntries: [] });
            saveSettings();
            log('info', 'ui', '新建了一个组件');
            renderWidgetList($panel);
        });

        $panel.find('#ow_generate_now').on('click', async () => {
            const $btn = $panel.find('#ow_generate_now');
            $btn.prop('disabled', true).html('<i class="fa-solid fa-spinner ow-spin"></i> 生成中…');
            try {
                await runGenerationPipeline((w, phase) => {
                    const name = (w && w.name) ? w.name : (w === 'offscreen' ? '镜头之外' : String(w));
                    if (phase === 'start') toast(`正在生成：${name}`, 'info');
                    if (phase === 'error') toast(`「${name}」生成出错，详见日志标签页`, 'error');
                });
                toast('全部生成任务已结束（若有失败项请查看日志标签页）', 'success');
            } catch (err) {
                log('error', 'system', '批量生成流程抛出未捕获异常', err);
                toast('生成过程中出现错误，详见日志标签页', 'error');
            } finally {
                $btn.prop('disabled', false).html('<i class="fa-solid fa-wand-magic-sparkles"></i> 立即生成全部已开启组件');
                renderWidgetResults($panel);
                if ($modal) {
                    log('debug', 'ui', '批量生成结束，刷新"镜头之外"标签页显示（即使当前未切换到该标签页也一并更新，避免数据已写入但界面未重绘）');
                    renderOffscreenPanel($modal.find('.ow-panel[data-panel="offscreen"]'));
                }
            }
        });
    }

    // ---- 模块一：组件显示（只读结果，带前端渲染预览）----
    function renderWidgetResults($panel) {
        const s = settings();
        const cd = chatData();
        const $results = $panel.find('#ow_widget_results');
        $results.empty();

        const withResults = s.widgets.filter((w) => cd.widgetResults[w.id]);
        if (!withResults.length) {
            $results.append('<div class="ow-empty">还没有任何生成结果。点「立即生成全部已开启组件」，或到下方组件列表里单独生成某一个。</div>');
            return;
        }
        for (const w of withResults) {
            const result = cd.widgetResults[w.id];
            $results.append(`
              <div class="ow-result-frame-wrap" data-id="${w.id}" style="margin-bottom:12px;position:relative;">
                <div class="ow-result-head">
                  <span>${escapeHtml(w.name)} — ${result.error ? '⚠️ 生成失败' : `✅ ${new Date(result.updatedAt).toLocaleString()}`}</span>
                  <span>
                    <button class="ow-btn" data-action="view-raw" data-id="${w.id}">查看源码</button>
                    <button class="ow-btn" data-action="regen-one" data-id="${w.id}">重新生成</button>
                  </span>
                </div>
                <iframe class="ow-result-frame" sandbox="allow-scripts" allowfullscreen srcdoc="${escapeHtml(result.html)}"></iframe>
                <button class="ow-btn ow-fullscreen-corner-btn" data-action="fullscreen" data-id="${w.id}" title="全屏沉浸式查看"><i class="fa-solid fa-expand"></i></button>
              </div>`);
        }

        $results.off('click', '[data-action="view-raw"]').on('click', '[data-action="view-raw"]', function () {
            const id = $(this).data('id');
            const res = chatData().widgetResults[id];
            if (!res) return;
            const w = window.open('', '_blank');
            if (w) w.document.write(`<pre style="white-space:pre-wrap;word-break:break-all;">${escapeHtml(res.html)}</pre>`);
        });

        $results.off('click', '[data-action="fullscreen"]').on('click', '[data-action="fullscreen"]', function () {
            const id = $(this).data('id');
            const iframeEl = $results.find(`.ow-result-frame-wrap[data-id="${id}"] iframe`)[0];
            if (!iframeEl) return;
            const req = iframeEl.requestFullscreen || iframeEl.webkitRequestFullscreen || iframeEl.mozRequestFullScreen || iframeEl.msRequestFullscreen;
            if (req) {
                req.call(iframeEl).catch((err) => {
                    log('warn', 'ui', `进入全屏失败：${err.message || err}`);
                    toast('无法进入全屏，浏览器可能不支持或已阻止', 'warning');
                });
            } else {
                toast('当前浏览器不支持全屏 API', 'warning');
            }
        });

        $results.off('click', '[data-action="regen-one"]').on('click', '[data-action="regen-one"]', async function () {
            const id = $(this).data('id');
            const w = s.widgets.find((x) => x.id === id);
            if (!w) return;
            const $btn = $(this);
            $btn.prop('disabled', true);
            try {
                await generateWidget(w);
                toast(`「${w.name}」已重新生成`, 'success');
            } catch (err) {
                toast(`「${w.name}」生成失败：${err.message || err}`, 'error');
            } finally {
                updateInjections();
                renderWidgetResults($panel);
            }
        });
    }

    // ---- 模块二：组件列表（管理，不包含结果预览）----
    function renderWidgetList($panel) {
        const s = settings();
        const $list = $panel.find('#ow_widget_list');
        $list.empty();
        if (!s.widgets.length) {
            $list.append('<div class="ow-empty">还没有组件，点上方「新建组件」添加一个吧。</div>');
        }
        for (const w of s.widgets) {
            $list.append(renderWidgetCard(w));
        }
        bindWidgetCardEvents($panel);
    }

    function renderWidgetCard(widget) {
        const chips = (widget.presetEntries || [])
            .map((e, idx) => `<span class="ow-chip" data-widget="${widget.id}" data-idx="${idx}">${escapeHtml(e.name)}<span class="ow-chip-x" title="移除">✕</span></span>`)
            .join('');

        return $(`
        <div class="ow-widget-card" data-id="${widget.id}">
          <div class="ow-widget-card-head">
            <input type="checkbox" class="ow-enabled-toggle" ${widget.enabled ? 'checked' : ''} title="是否随批量生成一起发送">
            <input type="text" class="ow-input ow-name-input" value="${escapeHtml(widget.name)}" placeholder="组件名称">
            <button class="ow-btn" data-action="gen-one" title="仅生成此组件（结果显示在上方模块①）"><i class="fa-solid fa-play"></i></button>
            <button class="ow-btn ow-danger" data-action="delete" title="删除组件"><i class="fa-solid fa-trash"></i></button>
          </div>
          <textarea class="ow-textarea ow-prompt-input" placeholder="描述这个组件要生成什么，例如：生成一个虚构论坛帖子，主题是……">${escapeHtml(widget.prompt)}</textarea>
          <div class="ow-row">
            <select class="ow-select ow-preset-select" style="min-width:160px;"><option value="">选择预设…</option></select>
            <button class="ow-btn" data-action="load-preset">读取该预设条目</button>
          </div>
          <div class="ow-preset-list" style="display:none;"></div>
          <div class="ow-preset-chips">${chips}</div>
        </div>`);
    }

    function bindWidgetCardEvents($panel) {
        const s = settings();

        $panel.off('input', '.ow-name-input').on('input', '.ow-name-input', function () {
            const id = $(this).closest('.ow-widget-card').data('id');
            const w = s.widgets.find((x) => x.id === id);
            if (w) { w.name = $(this).val(); saveSettings(); }
        });

        $panel.off('input', '.ow-prompt-input').on('input', '.ow-prompt-input', function () {
            const id = $(this).closest('.ow-widget-card').data('id');
            const w = s.widgets.find((x) => x.id === id);
            if (w) { w.prompt = $(this).val(); saveSettings(); }
        });

        $panel.off('change', '.ow-enabled-toggle').on('change', '.ow-enabled-toggle', function () {
            const id = $(this).closest('.ow-widget-card').data('id');
            const w = s.widgets.find((x) => x.id === id);
            if (w) { w.enabled = $(this).is(':checked'); saveSettings(); }
        });

        $panel.off('click', '[data-action="delete"]').on('click', '[data-action="delete"]', function () {
            const id = $(this).closest('.ow-widget-card').data('id');
            if (!confirm('确定删除该组件吗？')) return;
            s.widgets = s.widgets.filter((x) => x.id !== id);
            delete chatData().widgetResults[id];
            saveSettings(); saveChatData();
            renderWidgetList($panel);
            renderWidgetResults($panel);
        });

        $panel.off('click', '[data-action="gen-one"]').on('click', '[data-action="gen-one"]', async function () {
            const id = $(this).closest('.ow-widget-card').data('id');
            const w = s.widgets.find((x) => x.id === id);
            if (!w) return;
            const $btn = $(this);
            $btn.prop('disabled', true);
            try {
                await generateWidget(w);
                toast(`「${w.name}」生成完成，结果见上方模块①`, 'success');
            } catch (err) {
                toast(`「${w.name}」生成失败：${err.message || err}，详见日志标签页`, 'error');
            } finally {
                $btn.prop('disabled', false);
                updateInjections();
                renderWidgetResults($panel);
            }
        });

        // 预设下拉：填充选项
        $panel.find('.ow-preset-select').each(function () {
            const names = getPresetNames();
            const $sel = $(this);
            for (const n of names) $sel.append(`<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`);
        });

        $panel.off('click', '[data-action="load-preset"]').on('click', '[data-action="load-preset"]', function () {
            const $card = $(this).closest('.ow-widget-card');
            const presetName = $card.find('.ow-preset-select').val();
            if (!presetName) { toast('请先选择一个预设', 'warning'); return; }
            const entries = getPresetEntries(presetName);
            const $list = $card.find('.ow-preset-list');
            if (!entries.length) {
                $list.html('<div class="ow-muted">该预设下没有可用的文本条目（或当前主 API 不是 Chat Completion 类型）。</div>').show();
                return;
            }
            $list.html(entries.map((e, idx) => `
                <div class="ow-preset-entry">
                  <input type="checkbox" data-idx="${idx}">
                  <label title="${escapeHtml(e.content).slice(0, 300)}">${escapeHtml(e.name)}</label>
                </div>`).join('') +
                `<div class="ow-row" style="margin-top:6px;"><button class="ow-btn ow-primary" data-action="confirm-add-preset">添加勾选的条目到组件</button></div>`).show();
            $list.data('preset-name', presetName);
            $list.data('entries', entries);
        });

        $panel.off('click', '[data-action="confirm-add-preset"]').on('click', '[data-action="confirm-add-preset"]', function () {
            const $card = $(this).closest('.ow-widget-card');
            const id = $card.data('id');
            const w = s.widgets.find((x) => x.id === id);
            const $list = $card.find('.ow-preset-list');
            const entries = $list.data('entries') || [];
            const checked = $list.find('input[type="checkbox"]:checked').map(function () { return Number($(this).data('idx')); }).get();
            if (!w || !checked.length) return;
            w.presetEntries = w.presetEntries || [];
            for (const idx of checked) {
                const e = entries[idx];
                if (e && !w.presetEntries.some((x) => x.identifier === e.identifier)) {
                    w.presetEntries.push(e);
                }
            }
            saveSettings();
            renderWidgetList($panel);
        });

        $panel.off('click', '.ow-chip-x').on('click', '.ow-chip-x', function (e) {
            e.stopPropagation();
            const $chip = $(this).closest('.ow-chip');
            const id = $chip.data('widget');
            const idx = $chip.data('idx');
            const w = s.widgets.find((x) => x.id === id);
            if (w) { w.presetEntries.splice(idx, 1); saveSettings(); renderWidgetList($panel); }
        });
    }

    // ---------------- 镜头之外面板 ----------------
    // 四张表的定义（列 key、列显示名、数据数组的存储字段名），用统一逻辑渲染/编辑/增删行，
    // 避免四张表各写一份重复代码。
    const OFFSCREEN_TABLES = [
        {
            key: 'scheduleTable',
            title: '日程表',
            rowFactory: () => ({ role: '', routine: '', seasonal: '', pool: '' }),
            columns: [
                { field: 'role', label: '角色' },
                { field: 'routine', label: '固定日程规律' },
                { field: 'seasonal', label: '时节性必然事件' },
                { field: 'pool', label: '弹性事务参考池' },
            ],
        },
        {
            key: 'characterTable',
            title: '角色表',
            rowFactory: () => ({ name: '', alias: '', relation: '', location: '', attitude: '' }),
            columns: [
                { field: 'name', label: '姓名' },
                { field: 'alias', label: '昵称' },
                { field: 'relation', label: '与用户的关系' },
                { field: 'location', label: '当前位置与正在做的事' },
                { field: 'attitude', label: '对用户的态度' },
            ],
        },
        {
            key: 'sceneTable',
            title: '场景表',
            rowFactory: () => ({ tag: '', name: '', location: '', structure: '', usage: '' }),
            columns: [
                { field: 'tag', label: '标签' },
                { field: 'name', label: '场景名称' },
                { field: 'location', label: '地理位置/距离参照' },
                { field: 'structure', label: '建筑/环境构造细节' },
                { field: 'usage', label: '用途' },
            ],
        },
        {
            key: 'itemAnchorTable',
            title: '物品轨迹表',
            rowFactory: () => ({ tag: '', name: '', chapters: '', location: '', status: '' }),
            columns: [
                { field: 'tag', label: '标签' },
                { field: 'name', label: '物品名称' },
                { field: 'chapters', label: '关联章节' },
                { field: 'location', label: '当前位置' },
                { field: 'status', label: '状态' },
            ],
        },
        {
            key: 'timelineTable',
            title: '核心待办事项表',
            rowFactory: () => ({ time: '', task: '', chapter: '' }),
            columns: [
                { field: 'time', label: '时间' },
                { field: 'task', label: '事项' },
                { field: 'chapter', label: '关联章节' },
            ],
        },
        {
            key: 'foreshadowTable',
            title: '伏笔表',
            rowFactory: () => ({ tag: '', content: '', chapter: '', status: '未回收' }),
            columns: [
                { field: 'tag', label: '标签' },
                { field: 'content', label: '内容' },
                { field: 'chapter', label: '埋设章节' },
                { field: 'status', label: '状态' },
            ],
        },
    ];

    function renderOffscreenPanel($panel) {
        const s = settings();
        const off = chatData().offscreen;

        let html = `
        <div class="ow-row">
          <label><input type="checkbox" id="ow_off_enabled" ${s.offscreen.enabled ? 'checked' : ''}> 启用"镜头之外"</label>
          <button class="ow-btn ow-primary" id="ow_off_generate"><i class="fa-solid fa-wand-magic-sparkles"></i> 立即生成/更新</button>
          <span class="ow-muted">${off.updatedAt ? `上次更新：${new Date(off.updatedAt).toLocaleString()}` : '尚未生成'}</span>
        </div>
        <div class="ow-hint">随组件一起发送四张表的生成提示词，但结果单独展示在这里，不会出现在"组件生成"界面。可在下方直接点击单元格编辑。</div>`;

        for (const t of OFFSCREEN_TABLES) {
            html += `
        <div class="ow-section-title">${t.title}</div>
        <table class="ow-table" data-table-key="${t.key}">
          <thead><tr>${t.columns.map((c) => `<th>${c.label}</th>`).join('')}<th></th></tr></thead>
          <tbody></tbody>
        </table>
        <div class="ow-row"><button class="ow-btn" data-action="add-row" data-table-key="${t.key}">+ 添加一行</button></div>`;
        }
        $panel.html(html);

        for (const t of OFFSCREEN_TABLES) {
            const $tbody = $panel.find(`table[data-table-key="${t.key}"] tbody`);
            for (const row of off[t.key] || []) $tbody.append(offscreenRowHtml(t, row));
        }

        $panel.find('#ow_off_enabled').on('change', function () {
            s.offscreen.enabled = $(this).is(':checked');
            saveSettings();
        });

        $panel.find('#ow_off_generate').on('click', async function () {
            const $btn = $(this);
            $btn.prop('disabled', true).html('<i class="fa-solid fa-spinner ow-spin"></i> 生成中…');
            try {
                await generateOffscreen();
                toast('镜头之外内容已更新', 'success');
            } catch (err) {
                toast(`生成失败：${err.message || err}，详见日志标签页`, 'error');
            } finally {
                $btn.prop('disabled', false).html('<i class="fa-solid fa-wand-magic-sparkles"></i> 立即生成/更新');
                renderOffscreenPanel($panel);
            }
        });

        $panel.find('[data-action="add-row"]').on('click', function () {
            const key = $(this).data('table-key');
            const t = OFFSCREEN_TABLES.find((x) => x.key === key);
            off[key] = off[key] || [];
            off[key].push(t.rowFactory());
            saveChatData();
            renderOffscreenPanel($panel);
        });

        bindOffscreenTableEvents($panel, off);
    }

    function offscreenRowHtml(tableDef, row) {
        const cells = tableDef.columns.map((c) => `<td contenteditable="true" data-field="${c.field}">${escapeHtml(row[c.field])}</td>`).join('');
        return `<tr>${cells}<td><button class="ow-btn ow-danger" data-action="del-row">✕</button></td></tr>`;
    }

    function bindOffscreenTableEvents($panel, off) {
        for (const t of OFFSCREEN_TABLES) {
            const $table = $panel.find(`table[data-table-key="${t.key}"]`);
            $table.on('blur', 'td[contenteditable]', function () {
                const idx = $(this).closest('tr').index();
                const field = $(this).data('field');
                if (off[t.key]?.[idx]) { off[t.key][idx][field] = $(this).text(); saveChatData(); }
            });
            $table.on('click', '[data-action="del-row"]', function () {
                const idx = $(this).closest('tr').index();
                off[t.key].splice(idx, 1);
                saveChatData();
                $(this).closest('tr').remove();
            });
        }
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
        <div class="ow-hint">
          当前识别到的世界书/聊天书：<span id="ow_wi_book_names">（点击上方按钮拉取）</span><br>
          默认发送"当前处于启用状态"的条目（即该条目在酒馆世界书编辑器里没有被禁用）。你可以在下面为每个条目
          单独覆盖是否要在生成组件/镜头之外时随行发送——覆盖只影响本扩展的发送行为，不会改变酒馆世界书本身的启用状态。
          识别范围包括：酒馆世界书面板里当前勾选激活的全局世界书、当前角色绑定的主世界书、当前聊天绑定的聊天书。
        </div>
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
        <div class="ow-hint">这里是实际发送给模型的系统提示词原文，直接编辑即可自动保存生效，不需要修改扩展代码就能微调措辞。</div>

        <div class="ow-section-title">组件生成提示词</div>
        <div class="ow-row"><button class="ow-btn" id="ow_prompt_widget_reset">恢复默认</button></div>
        <textarea class="ow-textarea" id="ow_prompt_widget" style="min-height:220px;">${escapeHtml(s.prompts.widgetSystemPrompt)}</textarea>

        <div class="ow-section-title">镜头之外 / 表格生成提示词</div>
        <div class="ow-row"><button class="ow-btn" id="ow_prompt_offscreen_reset">恢复默认</button></div>
        <textarea class="ow-textarea" id="ow_prompt_offscreen" style="min-height:360px;">${escapeHtml(s.prompts.offscreenSystemPrompt)}</textarea>`);

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
            s.prompts.offscreenSystemPrompt = $(this).val();
            saveSettings();
        });
        $panel.find('#ow_prompt_offscreen_reset').on('click', function () {
            if (!confirm('确定恢复"镜头之外/表格生成提示词"为默认内容吗？当前编辑内容会被覆盖。')) return;
            s.prompts.offscreenSystemPrompt = DEFAULT_OFFSCREEN_SYSTEM_PROMPT;
            saveSettings();
            renderPromptsPanel($panel);
        });
    }

    function renderSettingsPanel($panel) {
        const s = settings();
        const html = `
        <div class="ow-section-title">触发方式</div>
        <div class="ow-row">
          <label><input type="radio" name="ow_trigger" value="manual" ${s.triggerMode === 'manual' ? 'checked' : ''}> 手动（点击生成按钮）</label>
          <label><input type="radio" name="ow_trigger" value="auto" ${s.triggerMode === 'auto' ? 'checked' : ''}> 自动</label>
        </div>
        <div class="ow-col" id="ow_auto_trigger_fields" style="${s.triggerMode === 'auto' ? '' : 'display:none;'} padding-left:4px;">
          <label><input type="checkbox" id="ow_auto_content_tag" ${s.autoTriggers.onContentTag ? 'checked' : ''}> 检测到新回复中出现完整 &lt;content&gt;…&lt;/content&gt; 时触发（同时生成组件与镜头之外）</label>
          <div class="ow-row">
            <label><input type="checkbox" id="ow_auto_widget_floor" ${s.autoTriggers.widgetsByFloor.enabled ? 'checked' : ''}> 组件每
              <input type="number" class="ow-input" id="ow_auto_widget_floor_n" style="width:60px;margin:0 4px;" min="1" value="${s.autoTriggers.widgetsByFloor.interval}">
            楼层自动生成一次</label>
          </div>
          <div class="ow-row">
            <label><input type="checkbox" id="ow_auto_offscreen_floor" ${s.autoTriggers.offscreenByFloor.enabled ? 'checked' : ''}> 镜头之外每
              <input type="number" class="ow-input" id="ow_auto_offscreen_floor_n" style="width:60px;margin:0 4px;" min="1" value="${s.autoTriggers.offscreenByFloor.interval}">
            楼层自动生成一次（需先在"镜头之外"标签页里启用该功能）</label>
          </div>
          <div class="ow-hint">"楼层"按当前聊天的总消息条数计算，三种触发方式可以同时开启、互不冲突；标签触发命中的那一轮不会与楼层触发重复生成。</div>
        </div>

        <div class="ow-section-title">发送时携带的上下文</div>
        <div class="ow-row">
          <label class="ow-col" style="flex-direction:row;align-items:center;">随行发送最近
            <input type="number" class="ow-input" id="ow_history_depth" style="width:70px;margin:0 6px;" min="0" value="${s.historyDepth}">
            条聊天记录
          </label>
        </div>
        <div class="ow-row">
          <label><input type="checkbox" id="ow_include_wi" ${s.includeWorldInfo ? 'checked' : ''}> 随行发送世界书/聊天书条目（具体收发哪些书、哪些条目，去"世界书"标签页管理）</label>
          <label><input type="checkbox" id="ow_include_cb" ${s.includeCharBook ? 'checked' : ''}> 随行发送角色卡内嵌世界书全文</label>
        </div>

        <div class="ow-section-title">组件正文注入</div>
        <div class="ow-row">
          <label><input type="checkbox" id="ow_inject_widgets" ${s.injectWidgets ? 'checked' : ''}> 下次生成正文时注入组件结果（默认关闭）</label>
        </div>
        <div class="ow-row">
          位置：
          <select class="ow-select" id="ow_inject_pos">
            <option value="IN_PROMPT" ${s.injectPosition === 'IN_PROMPT' ? 'selected' : ''}>提示词顶部（角色定义之前）</option>
            <option value="IN_CHAT" ${s.injectPosition === 'IN_CHAT' ? 'selected' : ''}>聊天记录中（按深度插入）</option>
            <option value="BEFORE_PROMPT" ${s.injectPosition === 'BEFORE_PROMPT' ? 'selected' : ''}>提示词最前</option>
          </select>
          深度：<input type="number" class="ow-input" id="ow_inject_depth" style="width:70px;" min="0" value="${s.injectDepth}">
        </div>

        <div class="ow-section-title">镜头之外表格正文注入</div>
        <div class="ow-row">
          <label><input type="checkbox" id="ow_off_inject" ${s.offscreen.injectTables ? 'checked' : ''}> 下次生成正文时注入镜头之外表格与叙述（默认关闭）</label>
        </div>
        <div class="ow-row">
          位置：
          <select class="ow-select" id="ow_off_inject_pos">
            <option value="IN_PROMPT" ${s.offscreen.injectPosition === 'IN_PROMPT' ? 'selected' : ''}>提示词顶部（角色定义之前）</option>
            <option value="IN_CHAT" ${s.offscreen.injectPosition === 'IN_CHAT' ? 'selected' : ''}>聊天记录中（按深度插入）</option>
            <option value="BEFORE_PROMPT" ${s.offscreen.injectPosition === 'BEFORE_PROMPT' ? 'selected' : ''}>提示词最前</option>
          </select>
          深度：<input type="number" class="ow-input" id="ow_off_inject_depth" style="width:70px;" min="0" value="${s.offscreen.injectDepth}">
        </div>

        <div class="ow-section-title">API 设置</div>
        <div class="ow-row">
          <label><input type="radio" name="ow_api_mode" value="system" ${s.api.mode === 'system' ? 'checked' : ''}> 跟随酒馆当前 API</label>
          <label><input type="radio" name="ow_api_mode" value="custom" ${s.api.mode === 'custom' ? 'checked' : ''}> 使用独立 API（OpenAI 兼容）</label>
        </div>
        <div class="ow-col" id="ow_custom_api_fields" style="${s.api.mode === 'custom' ? '' : 'display:none;'}">
          <input type="text" class="ow-input" id="ow_api_url" placeholder="API 基础 URL，例如 https://api.openai.com/v1" value="${escapeHtml(s.api.url)}">
          <input type="password" class="ow-input" id="ow_api_key" placeholder="API Key" value="${escapeHtml(s.api.key)}">
          <div class="ow-row">
            <select class="ow-select ow-grow" id="ow_api_model">
              ${s.api.model ? `<option value="${escapeHtml(s.api.model)}" selected>${escapeHtml(s.api.model)}</option>` : ''}
              ${(s.api.modelList || []).filter((m) => m !== s.api.model).map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('')}
            </select>
            <button class="ow-btn" id="ow_api_pull_models">拉取模型列表</button>
          </div>
          <div class="ow-hint">填写后即自动保存，无需再点确认按钮。⚠️ API Key 会以明文形式保存在浏览器/酒馆设置文件中，客户端扩展无法安全加密存储密钥，请自行评估风险。</div>
        </div>

        <div class="ow-section-title">主题</div>
        <div class="ow-row">
          <label><input type="radio" name="ow_theme_mode" value="system" ${s.theme.mode === 'system' ? 'checked' : ''}> 跟随酒馆系统配色</label>
          <label><input type="radio" name="ow_theme_mode" value="custom" ${s.theme.mode === 'custom' ? 'checked' : ''}> 自定义 CSS</label>
        </div>
        <div class="ow-col" id="ow_custom_theme_fields" style="${s.theme.mode === 'custom' ? '' : 'display:none;'}">
          <div class="ow-hint">在此填写的 CSS 仅作用于本扩展弹窗，建议使用 .ow- 开头的选择器进行覆盖，例如 .ow-modal { background: #222; }</div>
          <textarea class="ow-textarea" id="ow_theme_css" style="min-height:100px;" placeholder=".ow-modal { }">${escapeHtml(s.theme.customCss)}</textarea>
          <div class="ow-row"><button class="ow-btn ow-primary" id="ow_theme_save">保存并应用</button></div>
        </div>

        <div class="ow-section-title">关于 / 更新</div>
        <div class="ow-row">
          <a href="${REPO_URL.replace(/\.git$/, '')}" target="_blank" rel="noopener noreferrer" class="ow-btn" style="text-decoration:none;">
            <i class="fa-brands fa-github"></i> 在 GitHub 上查看仓库
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
