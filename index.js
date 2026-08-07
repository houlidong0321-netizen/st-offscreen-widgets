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

    // 每聊天数据（组件生成结果 / 镜头之外表格与叙述）随存档保存
    function chatData() {
        const c = ctx();
        if (!c.chatMetadata[MODULE_NAME]) {
            c.chatMetadata[MODULE_NAME] = {
                widgetResults: {}, // { widgetId: { html, updatedAt } }
                offscreen: { narrative: '', scheduleTable: [], characterTable: [], updatedAt: null },
            };
        }
        if (!c.chatMetadata[MODULE_NAME].offscreen) {
            c.chatMetadata[MODULE_NAME].offscreen = { narrative: '', scheduleTable: [], characterTable: [], updatedAt: null };
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
    const WIDGET_SYSTEM_PROMPT =
        '你是一个为角色扮演聊天生成“侧边小组件”的助手。你的输出内容独立于正文剧情，' +
        '不会被写入正文，也不会推动主线，只是供用户把玩的附加视觉内容（例如虚构论坛帖子、' +
        '角色小传、番外短篇、状态面板等），因此可以自由发挥，但必须严格符合已建立的人设与世界观设定，' +
        '不得与正文已确认的事实冲突。请直接输出一段完整、可独立渲染的 HTML 片段（不需要 <html>/<head>/<body> 包裹），' +
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

    // 镜头之外：两张表的说明（原样保留自需求文档，作为系统级结构化指令）
    const OFFSCREEN_TABLE_SPEC = `
## 表7：日程表
列结构：角色 | 固定日程规律 | 时节性必然事件 | 弹性事务参考池
本表只记录正文中尚未提及的角色日常生活信息。记录两类内容：因身份而必然存在的规律性/时节性事务，
以及供离场角色抽取参考的弹性生活素材，均由"身份+当前故事时间点"自然推导得出。
"固定日程规律"：日常性、按周期反复发生的日程锚点，含具体星期与时段。
"时节性必然事件"：结合角色身份与当前故事日期所处季节/月份/节日/星期推导出的大概率事务，写法为"时间节点：事务"，无关联时留空"—"。
"弹性事务参考池"：与角色身份/性格相符、结合当前季节/星期/天气合理存在的偶发小事清单，用中文分号分隔多项，不要求真实发生过。
时节性事件时间窗口过去后应删除（下次进入类似节点可重新生成）；固定日程规律与弹性事务参考池仅在角色身份根本变化时整体更新。

## 表4：角色表
列结构：姓名 | 昵称 | 与用户的关系 | 当前位置与正在做的事 | 对用户的态度
记录所有已出场角色的身份信息与实时状态，确保离场角色也拥有可查证的当前生活状态。
"当前位置与正在做的事"：绝对上帝视角的物理位置与客观动作，不带情绪与内心活动，禁止写"未知"。
"对用户的态度"：用2-3个简写标签描述当前状态快照。
不删除，永久保留，即使角色长期不出场也不清理；每次更新都应覆盖"当前位置与正在做的事"字段。
`.trim();

    const OFFSCREEN_SYSTEM_PROMPT =
        '你是一个为角色扮演故事撰写“镜头之外”内容的助手。你的任务分两部分：\n' +
        '1. 叙述镜头之外的世界：正文没有描写、但此刻正在发生的各角色日常/工作/生活片段；对尚未发生的合理未来事件的想象与铺垫；' +
        '以及若干条“有概率发生的突发事件”清单（标注大致概率高低即可，不需要具体数字）。这部分内容绝不能与正文已经确认的剧情冲突，' +
        '也不能提前揭示正文尚未发生、但即将由用户或主角亲自经历的关键转折，只写背景性、氛围性的旁支内容。\n' +
        '2. 维护两张状态表，规则如下：\n' + OFFSCREEN_TABLE_SPEC + '\n\n' +
        '请仅输出一个 JSON 对象，不要输出任何 Markdown 代码块围栏或解释文字，结构必须是：\n' +
        '{"narrative":"（镜头之外叙述，含日常侧写/未来想象/突发事件列表，可用换行分段的纯文本或简单HTML）",' +
        '"schedule_table":[{"role":"","routine":"","seasonal":"","pool":""}],' +
        '"character_table":[{"name":"","alias":"","relation":"","location":"","attitude":""}]}\n' +
        '两张表需要覆盖当前已出场的所有角色（可参考已有表格数据进行增量更新，而不是每次全部重写）。';

    function buildOffscreenUserPrompt(extras) {
        const parts = [];
        if (extras.history) parts.push(`【最近聊天记录】\n${extras.history}`);
        if (extras.worldInfo) parts.push(`【世界书参考】\n${extras.worldInfo}`);
        if (extras.charBook) parts.push(`【角色卡内嵌世界书参考】\n${extras.charBook}`);
        const existing = chatData().offscreen;
        if (existing.scheduleTable?.length || existing.characterTable?.length) {
            parts.push(`【已有表格数据（请在此基础上增量更新，而不是从零重写）】\n${JSON.stringify({
                schedule_table: existing.scheduleTable,
                character_table: existing.characterTable,
            })}`);
        }
        parts.push('请结合当前故事所处的时间点（季节/月份/星期/节日，从聊天记录与世界书中推断）生成或更新内容。');
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

    async function gatherWorldInfo() {
        const c = ctx();
        let text = '';
        try {
            const names = new Set();
            const chatBook = c.chatMetadata?.world_info;
            if (chatBook) names.add(chatBook);
            const char = c.characters?.[c.characterId];
            const charBook = char?.data?.extensions?.world;
            if (charBook) names.add(charBook);
            for (const bookName of names) {
                if (!bookName) continue;
                const book = await c.loadWorldInfo(bookName);
                const entries = book?.entries ? Object.values(book.entries) : [];
                for (const e of entries) {
                    if (e.disable) continue;
                    const label = e.comment || (Array.isArray(e.key) ? e.key.join(',') : '条目');
                    text += `【${bookName} - ${label}】\n${e.content}\n\n`;
                }
            }
        } catch (err) {
            console.warn('[镜头之外] 读取世界书失败', err);
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
        const raw = await callModel(WIDGET_SYSTEM_PROMPT, userPrompt, `组件:${widget.name}`);
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
            const raw = await callModel(OFFSCREEN_SYSTEM_PROMPT, userPrompt, '镜头之外');
            const parsed = tryParseJsonRobust(raw, '镜头之外');
            if (!parsed) {
                throw new Error('未能从模型响应中解析出 JSON，两张表格因此没有更新。请在「日志」标签页查看完整响应内容，确认模型是否遵循了 JSON 格式要求。');
            }
            if (typeof parsed !== 'object' || Array.isArray(parsed)) {
                throw new Error(`解析出的内容不是预期的对象结构（实际类型：${Array.isArray(parsed) ? 'array' : typeof parsed}）`);
            }
            const cd = chatData();
            let changed = [];
            if (typeof parsed.narrative === 'string' && parsed.narrative.trim()) {
                cd.offscreen.narrative = parsed.narrative;
                changed.push('narrative');
            }
            if (Array.isArray(parsed.schedule_table)) {
                cd.offscreen.scheduleTable = normalizeScheduleRows(parsed.schedule_table);
                changed.push(`schedule_table(${cd.offscreen.scheduleTable.length}行)`);
            } else {
                log('warn', 'parse', '响应 JSON 中没有找到合法的 schedule_table 数组字段（表7 日程表未更新）', parsed);
            }
            if (Array.isArray(parsed.character_table)) {
                cd.offscreen.characterTable = normalizeCharacterRows(parsed.character_table);
                changed.push(`character_table(${cd.offscreen.characterTable.length}行)`);
            } else {
                log('warn', 'parse', '响应 JSON 中没有找到合法的 character_table 数组字段（表4 角色表未更新）', parsed);
            }
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
        const matched = messageHasClosedContentTag(mes.mes);
        log(matched ? 'info' : 'debug', 'trigger',
            `消息#${messageId} <content> 标签检测：${matched ? '匹配成功，准备自动生成' : '未匹配到闭合标签，跳过'}`,
            { mesPreview: String(mes.mes || '').slice(0, 500) });
        if (!matched) return;
        toast('检测到新正文，正在后台生成组件…', 'info');
        try {
            await runGenerationPipeline();
            toast('自动生成流程结束（详情见日志标签页）', 'success');
            refreshOpenPanels();
        } catch (err) {
            log('error', 'trigger', '自动生成流程抛出未捕获异常', err);
            toast('组件生成出现错误，详见日志标签页', 'error');
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
        if (off.narrative) parts.push(`镜头之外：\n${off.narrative}`);
        if (off.scheduleTable?.length) {
            parts.push('日程表：\n' + off.scheduleTable.map((r) => `- ${r.role}｜${r.routine || '—'}｜${r.seasonal || '—'}｜${r.pool || '—'}`).join('\n'));
        }
        if (off.characterTable?.length) {
            parts.push('角色状态表：\n' + off.characterTable.map((r) => `- ${r.name}（${r.alias || '—'}）｜关系:${r.relation || '—'}｜${r.location || '—'}｜态度:${r.attitude || '—'}`).join('\n'));
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
              <div class="ow-tab" data-tab="settings">设置</div>
              <div class="ow-tab" data-tab="log">日志<span class="ow-log-badge" id="ow_log_badge" style="display:none;"></span></div>
            </div>
            <div class="ow-panel active" data-panel="widgets"></div>
            <div class="ow-panel" data-panel="offscreen"></div>
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
        renderSettingsPanel($modal.find('.ow-panel[data-panel="settings"]'));
        $logPanel = $modal.find('.ow-panel[data-panel="log"]');
        renderLogEntries($logPanel);
        log('info', 'ui', '主界面已打开');
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
              <div class="ow-result-frame-wrap" data-id="${w.id}" style="margin-bottom:12px;">
                <div class="ow-result-head">
                  <span>${escapeHtml(w.name)} — ${result.error ? '⚠️ 生成失败' : `✅ ${new Date(result.updatedAt).toLocaleString()}`}</span>
                  <span>
                    <button class="ow-btn" data-action="view-raw" data-id="${w.id}">查看源码</button>
                    <button class="ow-btn" data-action="regen-one" data-id="${w.id}">重新生成</button>
                  </span>
                </div>
                <iframe class="ow-result-frame" sandbox="allow-scripts" srcdoc="${escapeHtml(result.html)}"></iframe>
              </div>`);
        }

        $results.off('click', '[data-action="view-raw"]').on('click', '[data-action="view-raw"]', function () {
            const id = $(this).data('id');
            const res = chatData().widgetResults[id];
            if (!res) return;
            const w = window.open('', '_blank');
            if (w) w.document.write(`<pre style="white-space:pre-wrap;word-break:break-all;">${escapeHtml(res.html)}</pre>`);
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
    function renderOffscreenPanel($panel) {
        const s = settings();
        const off = chatData().offscreen;

        let html = `
        <div class="ow-row">
          <label><input type="checkbox" id="ow_off_enabled" ${s.offscreen.enabled ? 'checked' : ''}> 启用“镜头之外”</label>
          <button class="ow-btn ow-primary" id="ow_off_generate"><i class="fa-solid fa-wand-magic-sparkles"></i> 立即生成/更新</button>
          <span class="ow-muted">${off.updatedAt ? `上次更新：${new Date(off.updatedAt).toLocaleString()}` : '尚未生成'}</span>
        </div>
        <div class="ow-hint">随组件一起发送两张表的生成提示词，但结果单独展示在这里，不会出现在“组件生成”界面。可在下方直接编辑表格内容。</div>

        <div class="ow-section-title">镜头之外叙述</div>
        <textarea class="ow-textarea" id="ow_off_narrative" style="min-height:120px;">${escapeHtml(off.narrative)}</textarea>

        <div class="ow-section-title">表7：日程表</div>
        <table class="ow-table" id="ow_schedule_table">
          <thead><tr><th>角色</th><th>固定日程规律</th><th>时节性必然事件</th><th>弹性事务参考池</th><th></th></tr></thead>
          <tbody></tbody>
        </table>
        <div class="ow-row"><button class="ow-btn" data-action="add-schedule-row">+ 添加一行</button></div>

        <div class="ow-section-title">表4：角色表</div>
        <table class="ow-table" id="ow_character_table">
          <thead><tr><th>姓名</th><th>昵称</th><th>与用户的关系</th><th>当前位置与正在做的事</th><th>对用户的态度</th><th></th></tr></thead>
          <tbody></tbody>
        </table>
        <div class="ow-row"><button class="ow-btn" data-action="add-character-row">+ 添加一行</button></div>
        `;
        $panel.html(html);

        const $sched = $panel.find('#ow_schedule_table tbody');
        for (const row of off.scheduleTable || []) $sched.append(scheduleRowHtml(row));
        const $char = $panel.find('#ow_character_table tbody');
        for (const row of off.characterTable || []) $char.append(characterRowHtml(row));

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
                console.error(err);
                toast(`生成失败：${err.message || err}`, 'error');
            } finally {
                $btn.prop('disabled', false).html('<i class="fa-solid fa-wand-magic-sparkles"></i> 立即生成/更新');
                renderOffscreenPanel($panel);
            }
        });

        $panel.find('#ow_off_narrative').on('input', function () {
            off.narrative = $(this).val();
            saveChatData();
        });

        $panel.find('[data-action="add-schedule-row"]').on('click', () => {
            off.scheduleTable = off.scheduleTable || [];
            off.scheduleTable.push({ role: '', routine: '', seasonal: '', pool: '' });
            saveChatData();
            renderOffscreenPanel($panel);
        });
        $panel.find('[data-action="add-character-row"]').on('click', () => {
            off.characterTable = off.characterTable || [];
            off.characterTable.push({ name: '', alias: '', relation: '', location: '', attitude: '' });
            saveChatData();
            renderOffscreenPanel($panel);
        });

        bindOffscreenTableEvents($panel, off);
    }

    function scheduleRowHtml(row) {
        return `<tr>
          <td contenteditable="true" data-field="role">${escapeHtml(row.role)}</td>
          <td contenteditable="true" data-field="routine">${escapeHtml(row.routine)}</td>
          <td contenteditable="true" data-field="seasonal">${escapeHtml(row.seasonal)}</td>
          <td contenteditable="true" data-field="pool">${escapeHtml(row.pool)}</td>
          <td><button class="ow-btn ow-danger" data-action="del-row">✕</button></td>
        </tr>`;
    }
    function characterRowHtml(row) {
        return `<tr>
          <td contenteditable="true" data-field="name">${escapeHtml(row.name)}</td>
          <td contenteditable="true" data-field="alias">${escapeHtml(row.alias)}</td>
          <td contenteditable="true" data-field="relation">${escapeHtml(row.relation)}</td>
          <td contenteditable="true" data-field="location">${escapeHtml(row.location)}</td>
          <td contenteditable="true" data-field="attitude">${escapeHtml(row.attitude)}</td>
          <td><button class="ow-btn ow-danger" data-action="del-row">✕</button></td>
        </tr>`;
    }

    function bindOffscreenTableEvents($panel, off) {
        $panel.find('#ow_schedule_table').on('blur', 'td[contenteditable]', function () {
            const idx = $(this).closest('tr').index();
            const field = $(this).data('field');
            if (off.scheduleTable[idx]) { off.scheduleTable[idx][field] = $(this).text(); saveChatData(); }
        });
        $panel.find('#ow_character_table').on('blur', 'td[contenteditable]', function () {
            const idx = $(this).closest('tr').index();
            const field = $(this).data('field');
            if (off.characterTable[idx]) { off.characterTable[idx][field] = $(this).text(); saveChatData(); }
        });
        $panel.find('#ow_schedule_table').on('click', '[data-action="del-row"]', function () {
            const idx = $(this).closest('tr').index();
            off.scheduleTable.splice(idx, 1);
            saveChatData();
            $(this).closest('tr').remove();
        });
        $panel.find('#ow_character_table').on('click', '[data-action="del-row"]', function () {
            const idx = $(this).closest('tr').index();
            off.characterTable.splice(idx, 1);
            saveChatData();
            $(this).closest('tr').remove();
        });
    }

    // ---------------- 设置面板 ----------------
    function renderSettingsPanel($panel) {
        const s = settings();
        const html = `
        <div class="ow-section-title">触发方式</div>
        <div class="ow-row">
          <label><input type="radio" name="ow_trigger" value="manual" ${s.triggerMode === 'manual' ? 'checked' : ''}> 手动（点击生成按钮）</label>
          <label><input type="radio" name="ow_trigger" value="auto" ${s.triggerMode === 'auto' ? 'checked' : ''}> 自动（检测到新回复中出现完整 &lt;content&gt;…&lt;/content&gt; 时触发）</label>
        </div>

        <div class="ow-section-title">发送时携带的上下文</div>
        <div class="ow-row">
          <label class="ow-col" style="flex-direction:row;align-items:center;">随行发送最近
            <input type="number" class="ow-input" id="ow_history_depth" style="width:70px;margin:0 6px;" min="0" value="${s.historyDepth}">
            条聊天记录
          </label>
        </div>
        <div class="ow-row">
          <label><input type="checkbox" id="ow_include_wi" ${s.includeWorldInfo ? 'checked' : ''}> 随行发送当前角色/聊天绑定的世界书全文</label>
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
            <button class="ow-btn ow-primary" id="ow_api_save">确认保存</button>
          </div>
          <div class="ow-hint">⚠️ API Key 会以明文形式保存在浏览器/酒馆设置文件中，客户端扩展无法安全加密存储密钥，请自行评估风险。</div>
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
        `;
        $panel.html(html);

        $panel.find('input[name="ow_trigger"]').on('change', function () { s.triggerMode = $(this).val(); saveSettings(); });
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
        $panel.find('#ow_api_url').on('change', function () { s.api.url = $(this).val().trim(); saveSettings(); });
        $panel.find('#ow_api_key').on('change', function () { s.api.key = $(this).val(); saveSettings(); });
        $panel.find('#ow_api_model').on('change', function () { s.api.model = $(this).val(); saveSettings(); });
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
        $panel.find('#ow_api_save').on('click', function () {
            s.api.url = $panel.find('#ow_api_url').val().trim();
            s.api.key = $panel.find('#ow_api_key').val();
            s.api.model = $panel.find('#ow_api_model').val();
            saveSettings();
            toast('API 设置已保存', 'success');
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
          </div>`);
        $('#extensionsMenu').append($btn);
        $btn.on('click', openModal);
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
        } catch (err) {
            log('error', 'system', '初始化失败', err);
        }
    });
})();
