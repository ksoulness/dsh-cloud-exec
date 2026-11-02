# cloud-exec

把重活交给云主机、本机只做编排的 DSH 技能（skill）。一次配好机器清单，之后**接新机器只改一个 JSON**，不新建技能、不写插件、不在项目文档里硬编码 IP。

## 它解决什么

本机（Windows 家宽）实测：上行 0.5–0.7 MB/s，下行 **30–40 KB/s**；而境外机之间 9–16 MB/s。所以正确姿势不是"把数据搬到本机再算"，而是**指令下发、结论回收、大文件永不经过本机**。

## 三层结构

| 层 | 位置 | 改动频率 |
|---|---|---|
| ① 清单（机器 / 通道 / 默认） | `$DSH_HOME/ops/exec-targets.json` | 接机器时改 |
| ② 命令（跨项目） | `dsh-exec`（`$DSH_HOME/ops/bin/dsh-exec.mjs`） | 几乎不改 |
| ③ 规则（默认行为） | 全局 `AGENTS.md` + 全局 prompt note | 几乎不改 |

## 用法

```bash
dsh-exec which                     # 当前目标 + 通道 + fallback
dsh-exec list                      # 全部目标
dsh-exec probe [目标]              # 探活
dsh-exec run <目标|-> -- "<cmd>"   # 在目标上执行，- 表示当前 active
dsh-exec use <目标>                # 切换默认
```

连不上（ssh 255）自动降级到 `fallback`，并在 stderr 打 `[已降级到 X]`。

## 接新机器

1. SSH 免密可登 + 运行时就位；
2. 在 `exec-targets.json` 加一条 target（字段见 `references/targets-schema.md`）；
3. `dsh-exec probe 新机器` ✔ + `dsh-exec run 新机器 -- "nproc; free -g | sed -n 2p"` 对上硬件，才算接完。

完整验收清单：`references/onboarding-checklist.md`。

## 什么不该下发

实时交易/生产状态（以原权威机为准，只读）、被数据中心 IP 封的服务（实测 Binance 451 / Bybit 403）、需要登录态的浏览器操作、本机守卫类任务、同账号本机与远端双跑。

## 安装

```bash
git clone https://github.com/ksoulness/dsh-cloud-exec.git "$DSH_HOME/agents-home/skills/cloud-exec"
# 再把 ops/exec-targets.json 与 ops/bin/dsh-exec.mjs 放到 $DSH_HOME/ops/ 下（按本文件"三层结构"）
```

技能本体只有 `SKILL.md` + 两个 `references/` 文件；`ops/` 下的示例文件是给你照抄起点用的，真实清单里应该只出现你自己的机器。
