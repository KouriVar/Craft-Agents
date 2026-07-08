# 更新日志

## 2026-07-08 初始整理

基于 upstream v0.11.0 (`f4e172bf`) + 上游 Simplify session status navigation (`6eeb6d5f`)。

### 功能提交

- `feat(messaging)` 微信接入（ilink 协议适配器）
- `feat(memory)` agent 记忆 + 腾讯DB网关（bm25 走 Git LFS）
- `core` 核心集成（路由/类型/设置/壳 接入 memory/wechat）
- `build` 打包脚本与配置
- `i18n` 多语言文案

### 大文件处理

`bm25_zh_default.json`（81MB）转 Git LFS，仓库不再膨胀。

### 仓库形态

从 fork 改为独立仓库（GitHub fork 不能上传新 LFS 对象，报 `can not upload new objects to public fork`）。

### 同步上游的方法

```bash
git fetch upstream
git merge upstream/main   # 在 my-changes 上合并
# 解冲突 → 测试 → 打包
bun run electron:dist:dev:mac
```

不用 GitHub 网页的 Sync fork，本地 git 更可控。
