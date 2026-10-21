# 课外锻炼成绩管理

学校课外活动的学生名单、成绩、照片识别、院级与年级权限、学期归档管理应用。

- [代码结构与扩展约定](docs/architecture.md)
- [维护、排错、备份与回退](docs/operations.md)
- [最近容量测试及限制](tests/FULL-STABILITY-20261020.md)
- [业务使用说明](使用说明.md)
- [五档评级与折算规则](docs/activity-rating.md)
- [我的待办与回退说明](docs/todo-dashboard.md)

日常修改运行 `npm run check:quick`；提交或发布前运行 `npm run check`，一次完成类型检查、单元测试、构建、角色业务和并发写入回归。集成测试使用隔离数据，完成后自动清理临时目录。

稳定性受部署资源、网络、设备和服务配额影响，不能保证永不故障。目前集中登录仍有已知容量限制，详见测试报告。本仓库只备份源码，不保存学校业务数据库与照片。

---

以下保留底层框架和历史运行说明。

# vinext-starter

A clean full-stack starter running on [vinext](https://github.com/cloudflare/vinext), with optional Cloudflare D1 and Drizzle support.

## Prerequisites

- Node.js `>=22.13.0`
- Portable: Windows, macOS, or Linux; no Bash required
- Managed Linux: managed Linux runtime with Bash, `flock`, `curl`, `sha256sum`, and GNU `timeout`
- Git is required only for publishing

## Sites Lifecycle

The Sites initializer copies the shared starter and selects managed-linux only when `SITES_MANAGED_LINUX_CONTAINER=1`; otherwise it selects portable. It saves the selection only in ignored `.sites-runtime/execution-profile.json`. Both profiles copy/configure first, then use the plugin's separate `install-dependencies.mjs` step to measure installation independently. Edit source under `app/` and follow the Sites skill for installation, preview, builds, and publishing.

Run `node <plugin-root>/scripts/configure-execution-profile.mjs` only when the profile is unknown for the current checkout and environment. Profile changes do not alter tracked source or require reinstalling otherwise-valid dependencies; restart an existing preview to use the new selection. Do not commit or upload `.sites-runtime/`.

This starter does not use `wrangler.jsonc`.

`install:ci` runs `npm ci` once against the shared lockfile, disables parent-workspace discovery, and includes required dev/optional dependencies despite production/omit settings. Sharp defaults to prebuilt binaries unless explicitly configured otherwise. Do not overlap installers.

- **Portable:** Preserve host HOME, npm cache, registry, proxy, temporary paths, retry/concurrency settings, and lifecycle-script policy. Use `--prefer-offline --no-audit --no-fund`.
- **Managed Linux:** Use the existing project-local HOME/cache/tmp setup and Linux install lock, tarball preflight, and timeout. Restore the image-seeded npm cache only when its lockfile hash matches; retain network fallback. Builds keep their existing timeout. These helpers are not invoked by the portable profile.

`scripts/sites-env.mjs` preserves the caller's HOME, npm cache, proxy, XDG, and temporary-directory configuration while defaulting Wrangler and Miniflare state to the checkout. If npm reports an unwritable cache, select a writable path with `npm_config_cache` for that install. The `dev` and `start` scripts also keep Wrangler logs inside the checkout. `.sites-runtime/` and `.wrangler/` are ignored by Git; **`.wrangler/state` holds local accounts, rosters, grades, and photos, so back it up before deleting or changing checkouts.**

On portable, `npm run dev` uses `vinext dev` with HMR, starting at port 5173. Vinext records the running server in ignored `.vinext/` state, rejects an ordinary duplicate launch, and recovers stale state after a stopped process; exactly simultaneous starts can race. Pass `--port <port>` or `--hostname <host>` after `npm run dev --` when needed; keep portable previews on loopback.

For browser QA on managed Linux, use `sites-preview start`. The project's dev script runs Vite and accepts the supervisor's `--host 0.0.0.0 --port 4173 --strictPort` arguments. The internal browser uses `http://terminal.local:4173/`; it is not a user-facing URL. The supervisor owns the preview lifecycle. The ignored local profile survives the supervisor's cleared process environment.

Current builds use project-issued usernames and passwords. Open `/login` for an existing account; a fresh database requires a server-side `ADMIN_SETUP_TOKEN` and `/setup` to create its one administrator. The older platform sign-in path is available only if `localAccounts` is turned off in `lib/flags.ts`.

The Worker uses `vinext/server/fetch-handler`, including Vinext's config-aware image handling. After building, `npm start` runs that Worker locally through Wrangler on `127.0.0.1`, sharing `.wrangler/state` with dev preview and local D1 migrations; it does not deploy the site or simulate sign-in. Use the URL printed by the server. Pass `npm start -- --port <port>` to select a different built-preview port.

Local previews use Miniflare's placeholder `Request.cf` metadata without a network lookup. Set `CLOUDFLARE_CF_FETCH_ENABLED=true` to opt into fetching preview metadata; this setting does not change hosted request metadata.

Local tool usage metrics are disabled by default. Set `WRANGLER_SEND_METRICS=true` to opt in.

## Included Shape

- edit site code under `app/`
- `app/chatgpt-auth.ts` provides optional dispatch-owned ChatGPT sign-in helpers
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `db/index.ts` reads the D1 binding from the Cloudflare Worker environment
- `db/schema.ts` starts intentionally empty
- `@cloudflare/workers-types` provides Worker types; `cloudflare-env.d.ts` declares optional `DB`/`BUCKET` bindings—update these declarations if binding names change
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Workspace Auth Headers

Signed-in visitors receive both `oai-authenticated-user-id` and `oai-authenticated-user-email`. Private Sites require every visitor to sign in; public Sites may also have anonymous visitors, for whom neither header is present.

The user ID is stable for the same user on the same Site and different across Sites. Use it as the durable user key; use email and name for display or contact purposes.

SIWC-authenticated workspace sites may also receive `oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty `name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by `oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const userId = requestHeaders.get("oai-authenticated-user-id");
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use the returned `userId` as the stable user key for user-owned records; do not use email as a durable identifier.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send anonymous visitors through Sign in with ChatGPT.
- In a Server Component, start sign-in with `<a href={chatGPTSignInPath(returnTo)} target="_top">`. The auth helper module is server-only; do not import it into a Client Component.
- Do not use `fetch`, XHR, a client-side router, or a framework link that can prefetch the sign-in route. SIWC must start as a top-level navigation.
- Never request the AuthAPI authorization endpoint directly. The dispatch-owned `/signin-with-chatgpt` route must start the SIWC flow.
- Use `chatGPTSignOutPath(returnTo)` for browser sign-out links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the OAuth cookies, and identity header injection. Do not implement app routes for those reserved paths. Routes that do not import and call the helper remain anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the Sites hosting platform's access policy controls for workspace-wide restrictions, or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write actions tied to the current ChatGPT user. Leave public content anonymous.

## Local D1 migrations

### 学年名单回退

学年名单功能由 `lib/flags.ts` 中的 `yearlyRosters` 控制页面入口。原始 `students`、`groups`、`events`、`scores` 不被覆盖或删除；首次读取时将旧名单复制到独立的 `roster_years`、`roster_groups`、`roster_students`、`roster_intakes` 表。部署前源码快照为 Git 标签 `pre-yearly-rosters-20260925` 和 `D:\课外锻炼\backups\source-before-yearly-rosters-20260925.zip`。如需回退整个版本，恢复该标签的源码并发布上一站点版本；新增的学年表会保留，旧版不会读取它们。仅关闭 `yearlyRosters` 会隐藏学年切换入口，适合临时停用页面入口；完整回退应恢复旧版源码。

学院档案与新校徽上线前的源码快照是 `pre-college-crud-logo-20260925` 和 `D:\课外锻炼\backups\source-before-college-crud-logo-20260925.zip`。`lib/flags.ts` 的 `collegeDirectory` 可临时隐藏学院管理入口；完整回退需恢复此快照并重新发布。学院归档只更改 `colleges.active`，不删除学生、活动、照片或成绩；改名会更新新学年名单表中的学院名称。

活动等次与连续上传上线前的源码快照是 `pre-activity-rating-20260926` 和 `D:\课外锻炼\backups\source-before-activity-rating-20260926.zip`。`lib/flags.ts` 中的 `activityRating` 控制评级和折算，`continuousPhotoUpload` 控制确认前同组后续照片继续加入本次活动草稿。完整回退可恢复快照并重新发布；新增的 `event_ratings` 表会保留但旧版不会读取。活动按小组独立编号，确认一次后同组下次上传进入下一次。优、良、及格分别按原始分的 100%、80%、60% 折算，保留原始分；尚无等次的旧活动不凭空计算折算分。

浅绿页头和整齐导航上线前的源码快照是 `pre-comfort-header-20260926` 和 `D:\课外锻炼\backups\source-before-comfort-header-20260926.zip`。主题样式隔离在 `app/comfort-header.css`，将 `lib/flags.ts` 的 `comfortHeader` 设为 `false` 可临时恢复旧版配色和导航布局；版本号已从页面移除，不受该开关影响。完整回退需恢复快照并重新发布。

已登记活动删除与关联数据同步上线前的源码快照是 `pre-activity-delete-sync-20260926` 和 `D:\课外锻炼\backups\source-before-activity-delete-sync-20260926.zip`。`lib/flags.ts` 的 `activityDeletion` 可关闭已登记活动的删除入口和接口；`draftDeletion` 仍单独控制草稿删除。删除时会同步清理本次成绩、评级、修改记录和独占照片，保留共用照片中其他小组的数据，并让同组后续活动序号前移。完整回退需恢复快照并重新发布；已经删除的数据不会因回退源码而恢复。

批量照片等次识别上线前的源码快照是 `pre-photo-rating-20260930` 和 `D:\课外锻炼\backups\source-before-photo-rating-20260930.zip`。一次可选最多 30 张照片；在照片右上角清晰写一个“优”“良”“中”“差”或“无”（旧表的“合格”“及格”兼容为“中”），系统会把该等次赋给照片匹配到的小组活动，并在草稿总表中显示按 100%、80%、60%、50%、0% 计算的折算分。右上角同时列出多个等级、识别不清或同组照片等级冲突时不会猜测或覆盖已有等次，应在活动详情中核对。将 `lib/flags.ts` 的 `photoRatingRecognition` 设为 `false` 可关闭自动赋等次；完整回退需恢复快照并重新发布。更新本机 RapidOCR 代码后需重启 `npm run rapidocr`。

照片未写等次或未能识别时，可在“活动登记”的照片卡片中按小组活动选择“优／良／中／差／无”。选择后立即保存；草稿预览折算分随之刷新，已确认活动的 Excel 导出也使用新等次。手动入口的上线前快照是 `pre-manual-photo-rating-20260930` 和 `D:\课外锻炼\backups\source-before-manual-photo-rating-20260930.zip`；将 `lib/flags.ts` 的 `manualPhotoRating` 设为 `false` 可关闭照片卡片中的入口，活动详情中的原有等次编辑仍可使用。完整回退需恢复快照并重新发布。

For a D1-backed local preview, generate SQL with `npm run db:generate`. Build once through the Sites skill's build entrypoint (or `npm run build` for standalone use) to generate `dist/server/wrangler.json`, rebuilding if bindings change. From the project root, apply each pending migration in order:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_example.sql
```

Replace the filename with the pending migration and `DB` with your D1 binding name if different. Use `.wrangler/state`, not `.wrangler/state/v3`; Wrangler adds the versioned directories. Do not replay migrations already applied locally. This updates only the preview database; publishing applies production migrations separately.

## Diagnostic Commands

- `npm run install:ci`: perform the one locked dependency install
- `npm run dev`: start the Vite/Vinext development server
- `npm run build`: build the deployable Sites artifact
- `npm run start`: preview the built Worker locally with D1/R2 support
- `npm run db:generate`: generate Drizzle migrations after schema changes

When using the Sites plugin, follow its skill instructions for installation, builds, and publishing. These npm commands remain available for standalone use.

The portable build runs Vinext directly without a host `timeout` command. The managed-linux build uses `scripts/build-verified.sh` and its existing `SITES_BUILD_TIMEOUT` setting.

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)

## 三种身份与共享数据

网站统一使用原管理员的学校数据库。首次部署前，由管理员在托管环境中配置至少 32 个字符的随机 `ADMIN_SETUP_TOKEN` 运行密钥；密钥不能写进源码、部署清单或浏览器设置。随后进入 `/setup`，输入该初始化口令并创建本地管理员账号和密码，无需 Google 或 ChatGPT 身份验证。管理员账号创建成功后，初始化接口不再接受第二个账号，可以从托管环境移除该密钥。此后老师打开同一网址，在 `/login` 输入管理员分配的账号和密码。管理员在“人员权限”创建账号、指定身份与学院/入学年级、重置密码或停用账号。密码只在创建或重置时显示给管理员，数据库只保存加盐哈希；账号不能自行注册。

管理员管理全校数据和账号。院负责人可查看、导入和维护本院名单，录入、修改、确认、评级和导出本院成绩；不能操作其他学院。年级负责人只管理本院一个入学年级（如 2024 级）的成绩，不能修改名单。未分配账号无法访问名单、成绩、照片或导出接口。每次手动修改和识别录入记录操作账号。未打开编辑弹窗时，共享总表每 20 秒和切回窗口时刷新。多人修改同一活动时，以版本检查防止静默覆盖，冲突后刷新重试。

上线前可在项目目录运行 `npm run verify:roles`：它构建当前源码，在隔离的本地数据库执行所有迁移，验证管理员初始化、三种身份的权限范围、名单、成绩、照片、导出及账号停用，并在结束时删除该测试库；不会改动日常验收数据。

导入 Excel 可含“入学年级”列；缺少时取学号前四位。非标准学号需填写年级。原名单年级可在学生名单里修改。默认在老师的浏览器中免费识别照片，无需购买 API 或安装本机服务；首次识别需要联网下载模型，实际成绩仍须核对。本机 RapidOCR 和百度 OCR 仍可在“识别设置”里切换。只查看、手动录入不需要 OCR。

全校或学院名单可一次选择最多 5 万人的 Excel（文件不超过 10 MB），页面会自动每 500 人提交一次；中断后重新选择同一文件，已导入的学号会跳过。导入前会检查整份文件的学号、姓名、小组、入学年级和学院范围，避免处理到一半才发现文件内容不符。分批导入前快照为 Git 标签 `pre-school-roster-batch-20261005`；将 `lib/flags.ts` 的 `rosterBatchImport` 设为 `false` 可恢复原来的单次请求导入（最多 1 万人）。

本地验收使用 `.wrangler/state` 中的独立数据库，不会自动显示已发布网站的数据。关闭并重新启动项目时要继续使用同一项目目录；刷新网页不会清空该数据库。浏览器 OCR 上线前快照：Git 标签 `pre-browser-ocr-20261004` 和 `D:\课外锻炼\backups\source-before-browser-ocr-20261004.zip`。将 `lib/flags.ts` 的 `browserOcr` 设为 `false` 可回退到本机 RapidOCR 默认流程。

本地账号上线前快照：Git 标签 `pre-local-accounts-20261003` 和 `D:\课外锻炼\backups\source-before-local-accounts-20261003.zip`。`lib/flags.ts` 中 `localAccounts=false` 可暂时切回旧的 ChatGPT 身份验证；彻底回退时恢复快照并重新发布。账号和会话使用新增数据库表，原名单、照片和成绩不会迁移或删除。不要把老师密码写入源码或发送到聊天中。

免平台登录初始化修正前快照：Git 标签 `pre-bootstrap-secret-20261004` 和 `D:\课外锻炼\backups\source-before-bootstrap-secret-20261004.zip`。部署密钥只在运行环境配置，源码中的 `.env.example` 只列出名称；本地测试可用忽略提交的 `.dev.vars`。不配置密钥时，首次设置页不会允许创建管理员。

共享角色上线前快照：`pre-shared-roles-20261002` 和 `D:\课外锻炼\backups\source-before-shared-roles-20261002.zip`。`lib/flags.ts` 的 `sharedRoles=false` 会关闭老师的访问，保留原管理员访问和原有数据；需要完整回退时先把 Site 恢复仅自己可见，再恢复该源码快照并发布。角色表、年级映射和照片归属采用新增表，不删除原名单成绩。

人员权限核查修正前快照：`pre-role-audit-20261003` 与 `D:\课外锻炼\backups\source-before-role-audit-20261003.zip`。修正录入员的照片和学院人数统计，并保留院负责人对本院已移出名单学生的活动历史访问。共享权限仍由 `sharedRoles` 开关控制。

独立页面布局的修改前快照为 Git 标签 `pre-page-workspaces-20261007`。设置 `lib/flags.ts` 的 `independentPages=false` 可恢复各页共用的标题、筛选和统计布局。新布局隔离在 `app/workspace-page.tsx` 与 `app/workspace-page.css`；照片核对归入活动登记，导出预览只显示成绩表。学年新增与重命名放在学生名单，账号权限和识别设置不展示学年或学院筛选。该改动仅调整页面布局，不迁移或修改学校数据。

2026-10-11 本地账号与手机上传修改前快照：`pre-mobile-account-fix-20261011`。`sixCharacterPasswords=false` 恢复最低 12 位（不会修改已保存密码），`mobileLanPreview=false` 恢复仅本机访问并需重启。账号表单用独立 `.local-member-form` 布局。手机和电脑连接同一局域网，在手机访问电脑 IPv4 地址的 5173 端口；电脑须保持运行，防火墙如拦截需允许 Node 的专用网络访问。HTTP 局域网上传不依赖 crypto.randomUUID；提供相册多选及拍照入口。手机使用本机 RapidOCR 时经登录校验的 `/api/local-ocr` 转发到电脑 8765 服务，该转发仅在开发模式可用，生产构建禁止调用。匹配范围仍遵守账号权限，只写入照片中识别到的学生，未出现的人和已有成绩不被覆盖。

## 手机外网临时验收（不正式上线）

在项目目录运行 `npm.cmd run preview:internet`。它复用已运行的本机网站；未启动时先启动网站和 RapidOCR，首次自动下载 Cloudflare 官方 cloudflared 工具到忽略提交的 `.sites-runtime/tools`。终端打印随机 HTTPS 验收网址，手机用流量或其他 Wi-Fi 访问该网址，仍须输入管理员分配的账号密码，数据继续保存到电脑原来的本地数据库。电脑、网站和临时连接须保持运行；关闭后网址失效，下次启动网址变化。此功能不发布 Sites 生产版本，也不迁移学校数据。服务商或当前网络异常时可能连接失败，不能保证每个运营商都可达。

结束时运行 `npm.cmd run preview:stop`，或在启动连接的终端按 Ctrl+C。只关闭本次启动的进程；原先已运行的本机网站和识别服务保留。停止时删除本次运行状态文件，下载工具保留为下次启动的运行依赖，不产生临时测试库或照片。临时网址对应独立浏览器登录状态，电脑 localhost 上的登录不会自动带到手机。

修改前 Git 标签：`pre-temporary-internet-preview-20261011`。独立实现位于 `scripts/temporary-internet-preview.mjs` 和 `scripts/temporary-preview-proxy.mjs`；关闭 `lib/temporary-preview-config.mjs` 的 `TEMPORARY_INTERNET_PREVIEW` 可禁用启动入口，同时运行 `preview:stop` 关闭已有连接。该开关也映射到 `lib/flags.ts` 的 `temporaryInternetPreview`。代理只接到本机 5173，严格检查本次随机网址及写请求 Origin，不放开 Vite 的所有域名，不绕过账号或学院/年级权限。
