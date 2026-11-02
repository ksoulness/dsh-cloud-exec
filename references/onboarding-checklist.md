# 接一台算力机：验收清单

按顺序做，每步都有"看到什么才算过"。任一步没过就停在那里，不要继续往下假装完成。

## 0. 这台机器该不该接

- [ ] 它能出公网（或能经 tailnet 到），且**不会被平台随时回收**；抢占式/免费机只当溢出桶，不当默认算力与 CI runner。
- [ ] 它的出口 IP 不被目标服务封（拿 Data API 试一发：Binance/Bybit 对数据中心 IP 常回 451/403）。
- [ ] 它不是实时生产机。生产机只能以 `role: "data-source"` 登记，只读。

## 1. 登录通道

```bash
ssh -o BatchMode=yes -o ConnectTimeout=10 <别名> 'echo ok; hostname'
```

- [ ] 回 `ok` + 主机名。
- 首次连接报 `Host key verification failed` → 加 `-o StrictHostKeyChecking=accept-new` 写一次 known_hosts，属正常。
- 走 tailnet 的：先 `tailscale status` 看到本机节点与目标节点都在线，再试 `ssh <tailnet 别名>`。

## 2. 硬件与磁盘对账（别信账单，信命令）

```bash
ssh <别名> 'uname -a; nproc; free -g | sed -n 2p; df -h / /srv 2>/dev/null; lsblk -o NAME,SIZE,MOUNTPOINT | head'
```

- [ ] 架构、核数、内存、可用磁盘与你买的一致；`/` 剩余够跑目标负载（大库/镜像要单独挂盘）。
- [ ] 有 sudo（需要装包时）：`sudo -n true && echo sudo-ok`。

## 3. 运行时

```bash
ssh <别名> 'command -v node python3 git docker; node -v 2>/dev/null; python3 -V 2>/dev/null'
```

- [ ] 目标负载需要的运行时都在；python 用它自己的 venv 绝对路径，不依赖 `PATH`。
- [ ] 需要 dotenv/凭据的，确认文件权限 `600` 且不在 git 里。

## 4. 写进清单

在 `$DSH_HOME\ops\exec-targets.json` 的 `targets` 下加一条（字段见 `targets-schema.md`）：

- [ ] `candidates` 只写**实测通过**的通道。
- [ ] `bestVia` 用实测决定：两端各跑一次 4 MB 上下行，取快的；别凭"tailnet 应该更快"。
- [ ] `note` 写机型/内存/磁盘/到期日。

## 5. 从 DSH 侧验收

```bash
dsh-exec probe <新机器>
dsh-exec run <新机器> -- "echo remote-ok; hostname; nproc"
dsh-exec list
```

- [ ] `probe` 是 ✔（不是靠配置里的字）。
- [ ] `run` 输出与第 2 步一致。
- [ ] 想设默认：`dsh-exec use <新机器>`，再 `dsh-exec which` 确认。

## 6. 断连行为（一定要试一次）

- [ ] 故意给个坏 Host：`dsh-exec run badbox -- "true"`，确认退出码非 0 且 stderr 有明确原因（而不是静默成功）。
- [ ] 把 active 指向不可达目标时，确认出现 `[已降级到 local]` —— 说明降级链路有效，本机兜底可用。

## 7. 交付前最后一问

- [ ] 这台机器**明天消失**，我会损失什么？只有可再生的中间产物才算合格；不可再生的数据必须在源机或备份里，不在算力机。
