# 闲芯 · 电脑学习空间

Windows 本地学习网站，使用 Python 标准库、SQLite 和原生网页，无需安装网站账户或 Node 依赖。

## 运行

需要 Python 3.10+。C 代码练习另需 GCC，可放入 PATH，或使用原环境的 `D:\Dev\mingw64\bin\gcc.exe`。

双击 `Start-Studio.cmd`。也可用 PowerShell：

```powershell
.\Start-Studio.ps1
.\Start-Studio.ps1 -PythonPath 'C:\Python312\python.exe' -Port 8765 -DataDir 'D:\XianxinData'
.\Stop-Studio.ps1 -Port 8765 -DataDir 'D:\XianxinData'
```

环境变量 `STUDIO_PYTHON`、`STUDIO_PORT`、`STUDIO_DATA_DIR` 提供对应默认值。未指定时使用本目录 `data` 和端口 8765。启动器会校验服务的工程及数据目录，不会关闭别的项目占用的端口。同一数据目录仅允许一个实例。

前台直接运行可用于开发：

```powershell
python server.py --port 8765 --data-dir .local-data
```

页面地址为 `http://127.0.0.1:8765`。关闭浏览器不会停止本地服务。停止服务不会删除数据。

## 学习与设置

按“今日 → 课程 → 动手练习 → 日报”学习；概念题提交后可改选重试，代码题使用本机 GCC 检查实际输出。提示/解析会记录助学，不与独立通过混算。

在设置中查看环境、导出和导入电脑端备份、重置学习数据。重置要确认，先保留本机恢复副本，再清除进度、练习、草稿、笔记、日报、对话和计时；保留每日目标与 AI 模型设置、单独保存的密钥，AI 开关关闭。

DeepSeek 为可选功能，模型与思考选项以实际 API 支持为准。关闭 AI 时不应自动读取在线模型列表。普通学习备份不包含 API Key；更换 Windows 账户后需重新配置密钥。

## 旧版本数据

原 `LearningStudio` 工程不随仓库整合删除。推荐先在旧版导出备份，停止旧服务，再从新版设置导入。不要将两份进程同时指向同一份数据库；不要把 data 复制进公开 Git 历史。

电脑备份与原生鸿蒙备份不是同一格式，暂不互导、不云同步。手机上的训练题功能也不等于电脑端已经拥有同样的训练引擎。

## 检查

```powershell
python -m unittest discover -s tests -p "test_*.py"
python tests/verify_curriculum.py
node --check static/app.js
```

测试使用临时目录与模拟 API，不需要真实密钥。课程验证会用 GCC 编译内置参考答案。真实用户输入的原生程序有当前用户权限，超时和进程清理不构成隔离沙箱。
