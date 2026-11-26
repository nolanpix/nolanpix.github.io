# 站长统计后台 · nolanpix

公开博客仍由 GitHub Pages 提供；后台页面、登录与数据接口运行在同一个 Cloudflare Worker。GitHub 上的提交不会自动替换已部署的 Worker。无需自有域名。

## 一次性上线（先配置，再替换正在运行的代码）

1. 登录 **nolanpix** 的 GitHub，打开 [New OAuth App](https://github.com/settings/applications/new)。新建此后台专用的 OAuth App：Homepage URL 填 `https://nolanpix.github.io`，Authorization callback URL 必须精确为 `https://nolanpix-counter.song66666.workers.dev/admin/callback`。保存 Client ID；在 GitHub 生成 client secret，只放进下述 Cloudflare Secret。不要使用个人访问令牌或 `gh` 凭据。
2. 在 Cloudflare 建一个**空的、专用的** D1 库 `nolanpix-stats`。在已有 Worker `nolanpix-counter` 的 Bindings 中把它绑定为 `DB`。**保留原来的 KV 绑定 `COUNTER`**，不要指向新建的空 namespace。旧 Worker 可继续运行，无需清库。
3. 在 Worker 的 Settings → Variables and Secrets 添加 `GITHUB_CLIENT_ID`（文本）、`GITHUB_CLIENT_SECRET`（Secret）和 `ADMIN_PASSWORD_HASH`（Secret）。独立后台密码不要复用 GitHub 密码。下面的命令在**你自己电脑的本地终端**隐式读密码，输出可粘贴进 `ADMIN_PASSWORD_HASH` 的校验值；不要把密码、校验值或 client secret 发到聊天、Git 或工单。

   ```bash
   python3 -c 'import getpass,hashlib,secrets; p=getpass.getpass("New admin passphrase: "); q=getpass.getpass("Repeat: "); assert p==q and 16<=len(p)<=256,"Passphrases must match (16–256 characters)"; s=secrets.token_bytes(16); print("pbkdf2-sha256$100000$"+s.hex()+"$"+hashlib.pbkdf2_hmac("sha256",p.encode(),s,100000).hex())'
   ```

4. 确认这三个变量和两个绑定属于 **production** 环境；不要开包含请求 URL/头/正文的调试或请求日志（OAuth 回调有短期授权码）。在 Edit code 中用仓库本版 **整个 `worker/counter.js`** 替换旧代码并 Deploy。代码为单文件 ES module，无构建或运行时外部包。在 Triggers 中添加每日 `5 0 * * *`（UTC）清理任务。这保证即使很久没有访客也会执行留存清理。
5. 打开 [站长入口](https://nolanpix-counter.song66666.workers.dev/admin)。点 GitHub 登录，选择 nolanpix，再输入**独立后台密码**。只选择身份、不输入后台密码不能读取任何报表。公共站点不需要登录，`STATS_ENDPOINT` 不变。

如果习惯 Wrangler：在 `worker/` 下把 `wrangler.toml` 两个占位 ID 替换成现有 KV 和新 D1 的 ID；用 Wrangler 的交互式 `secret put` 分别设置以上三个变量，再执行 `wrangler deploy`。不要对带占位 ID 或绑定错误的环境执行部署。

## 如何验收

- 公共端：打开一篇博客文章，左下角显示本页浏览和今日 UTC 访客数；只读 `/stats?path=/` 返回 `ok,path,pv,dau`。短时重复访问通常只读不重复计数。
- 隐私窗口访问 `/admin/api/report` 应返回 **401**、`Cache-Control: private, no-store`，不返回统计。只完成 GitHub 登录时仍为 401；使用其他 GitHub 身份应是 403。所有者通过密码后，同一个浏览器中的 `/admin/api/report?days=30&offset=480` 才应为 200。
- 注销后报表再次返回 401；完整会话最长 12 小时。连续五次密码错误后等 15 分钟，再从 GitHub 重新登录。轮换密码时，除更新 Secret 外，在专用 D1 控制台运行 `DELETE FROM sessions` 可立即注销所有会话。
- 若 `/admin` 是 404 而旧 `/stats` 正常：往往是 **Pages 已更新，但 Worker 还是旧版本**。若返回 503，先检查绑定/变量再重试。不要删除数据库重新试。

## 迁移、口径与隐私

- 首次数据请求分批、可重入地导入 KV 的每页累计与每日访客数，进度与每批数据同一事务提交。导入完前拒绝新写入（503 可重试）。不导入旧限流键或错误的旧 `pv:__total__`；当日去重在切换日参考旧 seen 记录。请至少保留原 KV 到下一个 UTC 日并留作备份。导入后旧 KV 不再累计。若要回滚，保留 D1；旧代码不会自动反向同步 D1 的新增访问。
- 累计 PV 含导入的旧浏览；新明细、来源、入口和趋势**从切换时起**，不会虚构旧事件。天数为 7/30/90/365。窗口按浏览器当前 UTC 偏移对齐；夏令时历史边界不回算。多日访客是每日估计访客之和（visitor-days），不是跨天去重人数。入口是该访客当日首次被计数的页面，不是每个会话的入口。
- 服务端不把原始 IP、完整 UA、完整来源 URL、密码或 OAuth token 存入 D1。来源只留域名；国家和设备只记大类。随机盐按 UTC 日轮换，盐和去重标记约两天后清理，详细记录保留 365 天；每日汇总和每页累计保留。删除实际在清理任务或有新访问时进行。应用不控制 Cloudflare 自身的基础设施日志或数据库恢复窗口。
- 每个正常记录约 3–4 行 D1 写入，此外还有清理、登录和迁移；不要把免费套餐的行数当成保证的访客容量。公开的 `/hit` 限流是**每个 Worker 实例**的软限制，Origin 不是机器人身份证明。只影响统计，不保护 GitHub Pages 的静态文件。管理员 API 单独要求有效服务端会话，未对公共站点开放 CORS。

## 后台语言与主题（2026-11-26）

后台页默认显示中文，右上角有语言和主题两个按钮，选择保存在本 Worker 域名的 localStorage（`npa:lang` / `npa:theme`），与博客的设置互不影响。
按钮脚本由 Worker 自己在 `/admin/prefs.js` 提供，以满足 CSP `script-src 'self'`，不需要新增任何绑定或密钥。
改动只在 `worker/counter.js`：在 Cloudflare 控制台用新代码整体替换并部署即可，原有配置（D1、密钥、密码哈希）不变。
从主站进入后台时，入口链接会带 `?theme=light|dark&lang=zh|en`（`assets/prefs.js` 按当前生效的主题和语言实时写入）。后台读到后先应用并存入 `npa:theme` / `npa:lang`，再把参数从地址栏移除，后续登录跳转靠已保存的值保持；不带参数或参数非法时按已存偏好、否则跟随系统/默认中文。反向同理：后台的“返回博客”和 `np.` 品牌链接会带后台当前主题与语言（`adminPrefs` 实时写入），主站读到后存 `np:theme` / `np:lang` 再清参数；站内的首页、文章、404 与 MBTI（主题）共用这两个键，回到主站后色调与语言一致。双向参数都需要部署本版 `worker/counter.js` 才生效，旧版会忽略它们；浏览器自带的“后退”属于历史恢复，跨源无法同步，请用页面内的返回链接。MBTI 自测页目前只有中文，没有语言开关，翻译是独立任务。

## 报表的页面短名（2026-11-26）

报表接口会顺带取一次 `https://nolanpix.github.io/assets/pages.json`（2 秒超时），把 `/notes/x.html`
显示成短名；取不到时退回文件名。`pages.json` 由 `tools/gen_notes.py` 生成并随 Pages 发布，
所以新增笔记不需要重新部署 Worker。该请求失败只影响显示，报表本身照常返回。
