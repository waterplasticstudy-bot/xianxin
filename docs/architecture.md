# 两端整合边界

## 保留手机，优化电脑

2026-11-16 的整合以原生 HarmonyOS 1.1.6 r3 为手机基线。`shared/harmony-baseline.json` 记录从原工程复制的文件与 SHA-256，不记录私人绝对路径或设备标识。`verify-repository.py` 检查基线字节未改变。

电脑端继续以 Python 标准库和 SQLite 作为本地运行时，监听回环地址，由浏览器呈现 UI。这里的“本地服务”是本机进程，不是部署到公网的服务器。手机端直接调用原生文件、AssetStore、Worker 等能力，不依赖电脑在线。

## 共用的资源

`shared/video-catalog.json` 保存来自手机既有课程的资源与 lesson → resource 映射。`sync-video-catalog.py` 默认只检查；带 `--write` 时只更新电脑端课程的 resources 和每课 resourceIds，不改手机，也不覆盖电脑端 GCC 教学说明、题目、进度 ID 或课程版本。

它不是自动抓取器。已记录的 verifiedDate 与 verification 表示当时核验范围；分P不确定的 scanf 课明确保留“合集入口 · 分P待核实”，不能将链接存在等同于完整播放验证。

## 独立的数据与执行模型

| 方面 | 电脑 | 手机 |
| --- | --- | --- |
| C 练习 | 本机 GCC 编译运行 | 有限制的 C 子集解释器 |
| 存储 | 本地 SQLite + DPAPI | 本地 JSON + AssetStore |
| 备份 | stm32-studio-backup v1 | native v2 格式 |
| 训练 | 随课题和错题复习 | 随课题 + 模板随机/自适应训练 |
| 构建 | Python 标准库，网页无需打包 | DevEco / ArkTS / API 26 |

共享仓库不会自动同步学习记录，也不会将手机特有训练记录丢弃转换成电脑格式。后续如做跨端交换，应另行设计版本化 schema、预览、冲突规则和迁移测试。

## 升级与本机迁移

旧 LearningStudio 与 HarmonyLearning 工程保留。新的仓库目录不携带旧 data、密钥、日志或签名。已有电脑学习数据可通过旧应用导出，再在新电脑端导入；不要将手机备份导入电脑端。任何升级都应先备份。

本轮没有让手机重新安装或改变它的数据。手机基线检查与主机构建只验证源码复制后的完整性，不替代新的真机性能、握姿、能耗或商店审核。

