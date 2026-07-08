# Craft Agents（个人二开版）

基于 [craft-ai-agents/craft-agents-oss](https://github.com/craft-ai-agents/craft-agents-oss) 的个人本地化分支，自用为主。

## 相比原版的改动

- **微信接入**：ilink 协议适配器，应用内连接微信
- **agent 记忆 + 腾讯DB网关**：长期记忆功能（bm25 分词数据走 Git LFS）
- **app 图标改回经典 icns**：上游 macOS 26 新图标渲染不一致，改回经典
- **打包脚本**：mac 自用打包流程

## 致谢

感谢原项目 [craft-ai-agents/craft-agents-oss](https://github.com/craft-ai-agents/craft-agents-oss)。

## 自用备注

- 打包（mac，不签名）：`bun run electron:dist:dev:mac`
- 同步上游：`git fetch upstream && git merge upstream/main`
- 主分支：`my-changes`
