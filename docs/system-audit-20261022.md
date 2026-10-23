# 系统排查记录（2026-10-22）

本次检查范围：访问权限、学期归档、活动与照片写入、OCR 成绩解析、上传大小限制、依赖安全、TypeScript、生产构建、单元测试、隔离数据库中的多角色及并发回归。隔离测试使用合成数据，没有修改真实名单、成绩或照片。

## 已修复

- 新建活动时在同一数据库事务中重查小组、学期、学院、负责年级及账号状态，避免前置权限检查后权限被撤销仍创建草稿。
- 直接上传活动照片成功后增加活动版本号，使旧页面不能删除刚补传的照片；在事务中核查照片哈希是否已存在于任一上传入口。
- 照片识别入口也在事务中检查另一上传入口的哈希，避免并发请求绕过重复照片检查。
- OCR 只移除完整的学生学号，且只把学生身份前、格式明确的数字视作序号。多列成绩或越界成绩保留待核对，不猜测录入。
- 两个照片上传接口在解析 multipart 前限制整个请求体；本机 OCR 转发也按流限制请求体。
- 照片等次写入时重查活动、小组、归档和账号状态；异步识别失败不能把已处理照片改回待核对。
- 更新 Next.js、Sharp、js-yaml、source-map-js、fast-uri、baseline-browser-mapping 以及 Vite 到对应告警的修复版本。具体版本以 package-lock.json 为准。

## 验证

- `node scripts/check.mjs`：TypeScript、97 项单元测试、生产构建、三角色权限集成和短时并发集成；原始日志见 `../reports/system-audit-final-check-20261022.log`。
- 并发集成包括 20 次同组活动创建、36 张照片争抢 30 张上限、两入口同图争抢、旧版本删除保护、归档与权限测试；详见 `../reports/system-audit-20261022/races.md`。
- 源码变更前快照：`../backups/source-before-system-audit-20261022-101405.zip`。回滚时先停止网站、备份当时业务数据，再恢复源码快照及对应依赖；源码快照不包含真实业务数据。新加入的跨入口去重在 `lib/photo-upload-guard.ts`，可以单独审查；其他修改是已有接口的一致性修复，不能靠单一 UI 开关安全地停用。

## 尚需处理或未覆盖

- ESLint 基线仍有 92 项错误、37 项警告，主要是历史 `any`、未使用变量和 React Hooks 写法。这次未通过禁用规则掩盖；其中 `workspace.tsx`、`student-grades.tsx`、`photo-upload-review.tsx` 的 Hook 警告应在专门的界面重构中消除。
- 完整依赖审计在修复前列出 24 项开发依赖告警；Vite 和 Cloudflare 工具链已更新，旧版 Vinext 的其余传递依赖仍需兼容性评估。npm 审计接口在修复后超时，因此没有把最终告警数写成零。生产依赖的原有 6 项告警所涉包已升级到报告所示安全范围，但最终在线复查尚未完成。
- 目前只验证了本机短时并发和隔离 Worker；真实手机拍照 OCR、长时间运行、公网访问及真实业务数据恢复不是本次测试覆盖范围。

## 继续优化（2026-10-22）

- 已升级 `@cloudflare/vite-plugin`、`wrangler` 和 `@cloudflare/workers-types` 的兼容版本；对旧版 Vinext 固定的 `image-size`、Next ESLint 插件固定的 `fast-glob` 使用局部 npm override，避免为了两项间接依赖一起替换 React / RSC 运行时。
- 个人成绩弹窗按学期和学生标识重新挂载，移除渲染阶段写入 ref；照片上传待确认列表按当前活动或学期隔离，切换范围后不会继续显示旧范围的选中照片。
- TypeScript、97 项单元测试、生产构建、三角色权限集成及短时并发集成再次通过。对应日志：`../reports/followup-audit-full-20261022.log`、`../reports/followup-audit-final-quick-20261022.log`、`../reports/followup-audit-final-build-20261022.log`；并发报告：`../reports/followup-audit-20261022/races.md`。
- ESLint 由 92 项错误降至 90 项错误；72 项属于 `no-explicit-any`。其余含 8 项 Effect 内同步改状态、7 项渲染期间访问 ref、1 项闭包声明顺序。需要按文件梳理状态和 OCR 数据结构，不能直接统一替换成 `unknown` 或关闭规则。
- npm 在线审计接口仍超时；`npm audit --offline` 返回零项但缺少最新公告，不作为安全通过的证据。剩余告警数量仍未核实。
- 本轮修改前源码快照：`../backups/source-before-followup-audit-20261022-103923.zip`。

## OCR 返回值与类型边界（2026-10-22）

- 百度 OCR 的两个入口现共用返回值验证和排版解析；缺失、损坏或过长的识别结果明确报错，避免静默漏掉部分成绩。等次区域和成绩行使用同一识别规则。
- 本机 RapidOCR 返回值增加结构检查，并复用成绩识别行的长度约束。照片关联、小组检测和 Excel 导出的数据库查询改为明确字段及类型，减少宽泛 `any` 掩盖字段错误的机会。
- `node scripts/check.mjs` 再次通过：TypeScript、99 项单元测试、生产构建、三角色权限与并发集成。日志：`../reports/ocr-type-cleanup-final-full-20261022.log`；并发报告：`../reports/ocr-type-cleanup-final-20261022/races.md`。未使用真实百度 OCR 凭证或真实照片测试外部服务。
- 全项目 ESLint 从上一轮的 90 项错误、39 项警告降为 31 项错误、35 项警告，尚未全部通过；剩余主要涉及组件状态更新模式和少量宽泛类型。日志：`../reports/ocr-type-cleanup-final-lint-20261022.log`。
- 本轮修改前源码快照：`../backups/source-before-ocr-type-cleanup-20261022-104533.zip`。回滚前须先备份当时业务数据；源码快照不包含实际数据。

## 页面状态与异步请求（2026-10-22）

- 学院负责人目录与学期归档列表使用请求代次和取消信号，旧请求不会覆盖切换范围或后续刷新得到的数据。个人成绩弹窗的首次读取与手动刷新分开处理，避免加载时重复触发同步状态更新。
- 照片待上传列表切换活动时立即清空旧选择；缩略图仅在当前文件生成的预览就绪后显示，并在文件变化或组件卸载时释放临时图片 URL。
- 工作台初始化改为等待账号请求返回后再更新页面状态，卸载时取消首次请求；学期切换函数移到自动刷新逻辑之前，避免闭包顺序错误。归档学期的学生写入权限检查现在会实际使用 `write` 参数。
- 全项目 ESLint 由上一轮 31 项错误、35 项警告降至 3 项错误、16 项警告。剩余 3 项都是共享 JSON 请求及主工作台 API 的宽泛返回类型；它们涉及多个接口的输入和响应契约，不能只把 `any` 换成类型断言来宣称已验证。照片预览使用原图以及登录时完整重载页面的告警是当前交互有意保留的实现。
- 本轮修改前源码快照：`../backups/source-before-react-state-cleanup-20261022-125239.zip`，已验证压缩包可读取。业务数据库和上传照片不在源码快照中。
- 最终检查：`node scripts/check.mjs`（TypeScript、99 项单元测试、生产构建、三角色权限与并发集成），日志见 `../reports/react-state-cleanup-final-full-20261022.log`、并发报告见 `../reports/react-state-cleanup-final-20261022/races.md`；Lint 详情见 `../reports/react-state-cleanup-final-lint-20261022.log`。页面视觉交互和真实 OCR 服务未在此次自动检查中运行。
