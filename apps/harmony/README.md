# 闲芯 · 原生 HarmonyOS

此目录保留 1.1.6 r3 的手机源码。整合期间不修改已有生产逻辑和资源，文件基线见仓库根目录 `shared/harmony-baseline.json`。

## 构建

使用 DevEco Studio 打开此目录，安装工程声明的 API 26 SDK，再执行构建。AppScope 的发布版本为 1.1.6 / 1001006；`oh-package.json5` 的历史包元数据保留原样，不用于判断应用版本。

原始 `scripts/Build.ps1` 保留原环境默认目录 `D:\Program Files\Huawei\DevEco Studio`。如你的安装位置不同，优先通过 DevEco Studio 构建；不要假设这条本机脚本能在所有电脑直接运行。

```powershell
.\scripts\Build.ps1
$env:LEARNING_APP_ROOT = (Get-Location).Path
$env:LEARNING_CURRICULUM = Join-Path (Get-Location) 'entry/src/main/resources/rawfile/curriculum.json'
node --test tests/*.test.cjs
```

测试依赖 DevEco 的 TypeScript 编译工具和生成的 Index.ts，先完成构建。既有测试中部分 SDK 路径仍固定为原 DevEco 目录，本轮为保留手机代码未改写这些文件；在其他安装路径运行前需另做工具链适配。不能把普通 TypeScript 编译通过当作 ArkTS 原生构建通过。

## 安装与数据

仓库不含签名证书、私钥、调试 profile 或已签名 HAP。通过自己的 DevEco 调试签名安装到自己的设备。签名身份变化可能影响覆盖安装，不要为了换签名先卸载保存了学习记录的应用。

手机不需要电脑或远端业务服务器在线。AI 为可选项，数据与密钥由手机自身保存。备份格式与电脑端不同，不直接互导。

## 已知范围

21 节开放课程、35 道随课练习；训练库为 24 模板 × 12 个基础变式（288 题），不等于 288 个独立知识点。解释器不是 GCC 或开发板。真实左右手握持响应、精确触控延迟、能耗和其他机型需要单独真机验证。

