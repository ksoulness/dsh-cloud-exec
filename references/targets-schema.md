# exec-targets.json 字段说明

真身路径：`$DSH_HOME\ops\exec-targets.json`（DSH 示例：`D:\Program Files\DSH\ops\exec-targets.json`）。
读取者：`dsh-exec`（全局 CLI）、`polyexec`（poly 项目，启动时并入此处机器字段，避免双源漂移）。

## 顶层

| 字段 | 必填 | 含义 |
|---|---|---|
| `active` | ✔ | 默认目标名。`dsh-exec run -` 与省略目标的命令都用它 |
| `fallback` | 建议 | active 连不上时的降级目标（通常是 `local`） |
| `targets` | ✔ | `名称 → 目标定义`。名称即命令里用的名字，保持全小写、无空格 |

## 单个 target

| 字段 | 适用 | 含义 |
|---|---|---|
| `host` | ssh 目标 | SSH 别名的兜底值；`candidates` 缺省时用它 |
| `user` | ssh 目标 | 登录用户，省略则用 ssh 配置里的 |
| `port` | ssh 目标 | 非 22 时必填（如 vps 用 17222） |
| `kind` | 可选 | 仅 `local` 表示本机执行（走 `bash -lc`），其余视为 ssh |
| `candidates` | ssh 目标 | 通道列表 `[{via, ssh}]`；`via` 是给人看的标签（public / tailnet / wireguard…），`ssh` 是实际 Host 别名 |
| `bestVia` | 建议 | 当前选用的通道 `via`；`dsh-exec` 只走这一条，改它即换通道 |
| `workRoot` | 可选 | 该机的工作区根，重活产物落这里 |
| `jobsRoot` | 可选 | 队列目录（有的话：提交脚本 → 自动跑 → 日志与 rc） |
| `py` | 可选 | 该机 python 解释器绝对路径（venv 优先） |
| `role` | 可选 | `data-source` 标记"只当数据源、不当算力"的机器 |
| `note` | 建议 | 机型 / 内存 / 磁盘 / 到期日；写给未来的自己，`list` 会显示 |

## 一份可抄的骨架

```json
{
  "active": "box-a",
  "fallback": "local",
  "targets": {
    "box-a": {
      "host": "box-a", "user": "ops",
      "candidates": [
        { "via": "public",  "ssh": "box-a" },
        { "via": "tailnet", "ssh": "box-a-ts" }
      ],
      "bestVia": "public",
      "workRoot": "/srv/work", "jobsRoot": "/srv/jobs", "py": "/srv/app/venv/bin/python",
      "note": "4C/15G/49G，公网 203.0.113.10，2027-01-06 到期"
    },
    "local": { "kind": "local", "shell": "bash -lc" },
    "prod-box": { "host": "prod", "user": "root", "port": 22222, "role": "data-source", "note": "实盘机：只读，不承担算力" }
  }
}
```

## 改动后必须做的事

1. `dsh-exec probe <新机器>` 必须 ✔（只改 JSON 不 probe = 没接）。
2. `dsh-exec run <新机器> -- "uname -a; nproc; free -g | sed -n 2p; df -h / | tail -1"` 与预期硬件对上。
3. 想让它当默认：`dsh-exec use <新机器>`（等价于手改 `active`）。
4. 全部字段都是机器相关，**不要**把这些值抄进任何 SKILL.md。
