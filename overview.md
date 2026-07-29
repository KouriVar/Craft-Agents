# CraftAgent v0.17.0 发布概览

## 完成事项

CraftAgent v0.17.0 发布流程已全部完成：版本同步 → 提交 → 推送 → 打 tag → 推送 tag。

## 关键决策与变更

### 1. 版本号统一（发现并修复版本冲突）
- 仓库采用**统一版本号**约定：全部 14 个 package.json（root + 4 apps + 9 packages）必须同版本
- `check-version` 脚本额外校验 bun.lock 的 workspace 版本引用和 README 版本徽标
- **bun.lock 不能靠 `bun install` 同步**——bun 不重写已缓存的 workspace 版本，需直接编辑 13 处 `"version"` 字段
- 最终全部统一为 `0.17.0`，check-version 通过

### 2. Git 提交
- Commit: `f43c1572` on `my-changes`
- Message: `release: v0.17.0`
- 作者: `halfsignal <KouriVar@users.noreply.github.com>`（noreply 邮箱，GitHub 隐私保护）
- 120 文件，+8837/-920

### 3. Tag
- `v0.17.0`（annotated tag），message: `CraftAgent v0.17.0`
- 指向 commit `f43c1572`

## 发布产物

| 项目 | 值 |
|---|---|
| 版本 | 0.17.0 |
| Commit | f43c1572e77a3d7ef87c276818bfcc5b0dcc45e3 |
| 分支 | my-changes（已推送 origin） |
| Tag | v0.17.0（已推送 origin） |
| Remote | https://github.com/KouriVar/Craft-Agents.git |
| check-version | ✅ 通过（14 manifests + lock entries + README badge） |

## 版本同步清单（共 16 文件）

- 14 个 package.json：仅 `version` 字段 `0.16.0 → 0.17.0`
- bun.lock：13 处 workspace 版本引用 `0.16.0 → 0.17.0`
- README.md：第 9 行版本徽标 `version-0.16.0 → version-0.17.0`

## 留意项

- `docs/v0.16.2-project-context-foundation.md` 文件名带旧版本号 v0.16.2，但属设计文档，不影响发布。如需清理可在后续提交处理。

## 后续建议

- 若需在 GitHub 创建 Release（关联 tag v0.17.0），可后续用 `gh release create v0.17.0` 处理
- 本轮发布未跑完整 `validate:ci`（typecheck:all + tests + lint），如需 CI 级保障可在后续流程补跑
