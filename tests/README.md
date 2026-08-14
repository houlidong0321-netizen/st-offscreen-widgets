# 测试

扩展本身**零依赖**，只有跑测试需要装两个包。

## 首次准备

```bash
cd <扩展目录>
npm install --no-save jsdom jquery
```

## 跑测试

```bash
node tests/run-all.cjs
# 或
npm test
```

单独跑某一组：

```bash
node tests/03-plot.test.cjs
```

## 这些测试在测什么

| 文件 | 覆盖 |
|---|---|
| `01-structure` | 语法、重复声明、未定义函数、七个面板能否渲染、设置分组顺序 |
| `02-settings` | 默认值、旧版设置迁移、注入位置与深度、关键词触发 |
| `03-plot` | 矩阵生成、进度推进、标记扫描、备份恢复、悬空分支与死循环校验、提示词约束 |
| `04-summary` | 两种生成方式、楼层/章节计数、隐藏楼层后仍可总结、压缩与无损还原、聊天捕获 |
| `05-worldinfo-api` | 条目筛选、反控制世界书、API 地址归一化与错误提示、流式解析、表格增量维护 |
| `06-ui` | 预览高度反馈循环、高度上限、隐藏楼层前落盘、收藏快照 |

## 为什么要有这些

这个扩展是单文件的，改动主要靠字符串替换完成。**替换没匹配上时脚本不会报错**，
只有测试能兜住这类问题——历史上真的因此漏改过默认值、误删过整个函数。

所以：**每次改完代码都跑一遍**。

## 写新测试

`harness.cjs` 提供了 jsdom + 真 jQuery + mock 的 SillyTavern 环境：

```js
const { boot, tick, check, summary } = require('./harness.cjs');

(async () => {
    const app = boot({
        chat: [{ name: 'C', mes: '正文', is_user: false }],
        modelReply: '{"events":[]}',            // 模型返回什么
        expose: ['settings', 'generatePlot'],   // 要用到的内部函数
    });
    await tick();
    const T = app.T();

    check('某某行为正确', T.settings().plot.minEvents === 10);

    // app.rec 里记录了扩展往外发的东西：
    //   rec.injected         注入的提示词
    //   rec.lastSystemPrompt / rec.lastUserPrompt
    //   rec.slashCommands    执行过的斜杠命令
    //   rec.savedWorldInfo   写回的世界书

    summary('我的测试');
})();
```
