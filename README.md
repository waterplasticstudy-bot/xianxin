# 闲芯 · Xianxin

从第一行 C，到理解 STM32。面向零基础学习者的本地学习空间。

电脑上读课、写 C、用 GCC 编译；手机上用原生 HarmonyOS 应用学习和练习。两端源码在一个仓库维护，无自建远程服务器。学习进度、草稿、笔记和日报保存在各自设备。

## 开始使用

### 电脑端 · Windows

安装 Python 3.10+，以及可选的 GCC（代码练习需要）。进入 `apps/desktop`，双击 `Start-Studio.cmd`，浏览器打开 `http://127.0.0.1:8765`。不安装 Node 依赖也能运行电脑端。

也可以在仓库根目录运行：

```powershell
python apps/desktop/server.py
```

程序只监听本机。关闭网页不会删除进度；使用 `apps/desktop/Stop-Studio.cmd` 停止后台服务。支持的启动参数见 [电脑端说明](apps/desktop/README.md)。

### 手机端 · HarmonyOS

`apps/harmony` 保留已交付 **1.1.6 r3** 的原生 ArkTS/ArkUI 实现。使用 DevEco Studio 与 HarmonyOS API 26 SDK 构建，安装需要自己的调试签名。此仓库不附私人签名、已签名 HAP 或真实设备记录。

参见 [手机端构建说明](apps/harmony/README.md)。本轮整合不更改手机生产代码，不自动更新手机已安装应用。

## 可以做什么

- 今日任务、学习路线、21 节开放课程和 35 道随课练习。
- 电脑端 GCC 编译、逐个测试用例反馈、提示与解析、错题复习。
- 手机端 C 子集解释器、分层随机训练、自适应练习与受约束的 AI 变式。
- 专注计时、学习笔记和日报；本地备份、导入与数据重置。
- 可选 DeepSeek 助教，支持模型与思考档位；未配置时仍可使用本地课程。
- 标注 UP 主、视频标题与分集的 B 站学习资源。

每天可先安排 45–60 分钟：一小节概念、一个例子、一次练习，再用几句话记录今天学到的内容。没有开发板也能先学 C；软件练习通过不代表烧录、接线或真实外设验证。

## 仓库结构

```text
apps/desktop/   本地 Python 服务、网页界面和 GCC 运行器
apps/harmony/   保留版本的原生 HarmonyOS 工程
shared/        两端视频映射与手机基线文件哈希
scripts/       资源一致性、基线和公开内容检查
docs/          架构、开发与验证范围
```

两端的运行器、数据格式和 UI 不同。整合的是源码管理、品牌和视频来源，**不包含云同步，也不承诺两端备份能互相导入**。详细边界见 [架构说明](docs/architecture.md)。

## 开发检查

```powershell
python scripts/sync-video-catalog.py --check
python scripts/verify-repository.py
python -m unittest discover -s apps/desktop/tests -p "test_*.py"
python apps/desktop/tests/verify_curriculum.py
node --check apps/desktop/static/app.js
```

`verify_curriculum.py` 的课程执行验证需要 GCC；HarmonyOS 原生构建和主机测试另见手机端说明。GitHub Actions 运行电脑端回归和公开内容边界检查，不将其算作手机真机验收。

本轮已完成的本机与浏览器检查，以及尚未覆盖的范围，见 [验证记录](docs/validation.md)。

## 数据与安全

学习数据默认保存在 `apps/desktop/data`。升级前导出备份，不要删除数据目录。密钥由 Windows DPAPI / HarmonyOS AssetStore 单独保存，不进入普通学习备份。

启用 AI 后，模型目录和主动提问会连接 DeepSeek；打开视频会跳转 B 站。两者之外没有产品后台、云同步或统计服务。网络与本地执行的边界见 [SECURITY.md](SECURITY.md)。

内置课程与视频仅作学习导航，外部视频版权归原作者。代码仓库公开不代表应用已上架应用商店。

