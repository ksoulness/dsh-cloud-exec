---
name: cloud-exec
description: 当需要把重活（构建、测试、回测、仿真、批量计算、长任务）放到云主机跑、让别的机器去调资源、接入或切换一台新的算力机、排查"本机跑不动/太慢/网络封了"、或决定某个任务该在本机还是远端执行时使用。入口是 dsh-exec 命令，机器清单唯一真身是 $DSH_HOME/ops/exec-targets.json。触发词：云主机、执行端、算力机、跑批、dsh-exec、exec-targets、切执行端、接新机器、GCP 临时机、instabox、远端跑、offload。
metadata:
  version: "1.0.0"
  date: "2026-11-02"
  family: "generic（同一份文件供 DSH 各会话 / 其他 agent 共用）"
---

# cloud-exec（算力默认在云端，本机只编排）

## 一、先认一个事实

本机（Windows 家宽）**不适合当算力**，也不适合当中转站：

| 方向 | 实测 |
|---|---|
| 本机 → 境外机（上行） | 0.5–0.7 MB/s |
| 境外机 → 本机（下行） | **30–40 KB/s**（4 MB 跑满 150 s 没下来） |
| 境外机 ↔ 境外机（vps → GCP） | **9–16 MB/s** |

所以默认策略是：**重活下发，结论回收，大文件永不经过本机**。数据由执行端直连数据源拉取，本机只发指令、只收 KB 级结果。

## 二、三层结构（改动只动第 1 层）

| 层 | 位置 | 谁改 |
|---|---|---|
| ① 清单（机器/通道/默认） | `$DSH_HOME\ops\exec-targets.json` | 接新机、换默认时改这里 |
| ② 命令（跨项目可用） | `dsh-exec`（`$DSH_HOME\ops\bin\dsh-exec.mjs`） | 基本不用改 |
| ③ 规则（默认行为） | 全局 AGENTS.md「算力与执行端」+ 全局 prompt note | 基本不用改 |

**不要**为了接机器去新建技能、写插件、或在项目文档里硬编码 IP/机器名。

## 三、命令

```bash
dsh-exec which                     # 当前目标 + 走的通道 + fallback
dsh-exec list                      # 全部目标与角色
dsh-exec probe [目标]              # 探活（不看配置说了什么，只看 SSH 真通不通）
dsh-exec run <目标|-> -- "<cmd>"   # 在目标上执行；- 表示当前 active
dsh-exec use <目标>                # 切换默认（原地改 active）
```

`run` 的默认参数：`BatchMode=yes`、`StrictHostKeyChecking=accept-new`、`ConnectTimeout=15`；连不上（ssh 退出码 255）会**自动降级**到 `fallback` 并在 stderr 打 `[已降级到 X]`——看到这行就说明算力端不可用，别把失败当"任务本身报错"。

## 四、接一台新机器（三步）

1. **先把机器准备好**：SSH 免密可登（key 装好、`~/.ssh/config` 有 Host 别名）、有运行时（node/python，或写清用哪套路径）；需要经 tailnet 的，先入网并通过 ACL。
2. **在清单里加一条 target**：

```json
"新机器名": {
  "host": "ssh别名字", "user": "登录用户",
  "candidates": [
    { "via": "public",  "ssh": "公网别名" },
    { "via": "tailnet", "ssh": "tailnet别名" }
  ],
  "bestVia": "public",
  "workRoot": "/srv/work", "jobsRoot": "/srv/jobs",
  "py": "/path/to/python",
  "note": "机型/内存/磁盘/到期日，写给未来的自己"
}
```

字段取舍：`candidates` 只放**真实可用**的通道（多一条没测过的通道 = 多一次莫名超时）；`bestVia` 用 `polyexec bench` 或实测决定，不靠直觉；`role: "data-source"` 用来标记"只当数据源、不当算力"的机器（如交易实盘机）；不想让它被默认选中，就别写进 `active`。
3. **验收才算接完**：

```bash
dsh-exec probe 新机器名        # 必须 ✔
dsh-exec run 新机器名 -- "uname -a; nproc; free -g | sed -n 2p; df -h / | tail -1"
```

三项都对上（架构/核数/内存/盘）再宣布接好。只改 JSON 不 probe，等于没接。

## 五、什么能下发、什么不能（判据）

**能下发**：仓库构建与测试、回测与审计脚本、仿真批、批量抓取公开 API、一次性大计算。

**不能下发**（下发了必然失败或更糟）：

- **实时/生产状态**：交易实盘账本、下单、持仓——仍以原权威机为唯一真源，只读，不搬。
- **被数据中心 IP 封的服务**：实测美西机器 `api.binance` 451、`api.bybit` 403。看到 451/403 先怀疑出口 IP，不要怀疑代码。
- **需要登录态的浏览器操作**：数据中心 IP + 无 cookie 等于验证码地狱。
- **本机守卫类任务**（Windows 计划任务、本机弹窗/焦点、本地文件索引）：搬走就失去意义。
- **同账号双跑**：同一账号（如 BRAIN）本机与远端并行跑批 → 平台并发超限 + 僵尸批。跑前先确认另一端没在跑。

## 六、产物怎么回

| 产物大小 | 做法 |
|---|---|
| KB 级（结论、计数、切片、一行 JSON） | 直接 `dsh-exec run … -- "cat …"` 收回 |
| MB 级以上 | **留在执行端**，汇报里写远端路径；确需回本机时先用压缩/切片把量降下来 |
| 需要长期留存的数据 | 执行端直连源机拉（9–16 MB/s），不让本机中转 |

## 七、通道选择

`public` 与 `tailnet` 的差别**不是速度**（实测两者上下行同量级，tailnet 甚至略慢），而是可达性与暴露面：没公网 IP 的机器只能走 tailnet；有公网时 tailnet 的价值是绕开 ACL 暴露。选通道以实测为准（`polyexec bench` 会写回 `bestVia`），不要凭直觉。

## 八、踩过的坑

- **tailnet ≠ 快**：RTT 222 ms 时公网上行 0.7 MB/s、tailnet 0.53 MB/s；下行两条都几十 KB/s。
- **Windows 本机分支要用 `bash -lc`**：走 `cmd.exe` 时 `2>/dev/null` 会被当成文件重定向，静默出错。
- **首次连接报 `Host key verification failed`**：用 `-o StrictHostKeyChecking=accept-new` 写一次 known_hosts，之后正常。
- **免费/抢占式机器会冷却**：冷却期间连接被拒、批被杀。不要拿它当 CI runner 或长跑批的默认端；`probe` 先过再用。
- **降级是信号不是常态**：`[已降级到 X]` 出现两次以上就去修执行端，别习惯性在本机硬跑。
- **`tailscale status` 卡 `Tailscale is starting`**：`net stop/start Tailscale` 重启服务常能自愈，重启后先看 `tailscale status` 有自己节点再谈连通性。

## 九、和项目技能的分工

- 本技能只管**怎么连、连哪台、什么时候下发**（通用能力）。
- 某个项目里"哪些计算可下发、哪些必须实时机"写在该项目的 `SKILL.md`（业务语义）。
- 两者冲突时以项目技能的业务约束为准——数据权威性优先于算力便利。

## 十、参考

- 清单字段与示例：`references/targets-schema.md`
- 接机验收清单：`references/onboarding-checklist.md`
