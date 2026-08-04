# 🍪 cookie-sync

一个基于 **Manifest V3** 与 **Chrome Native Messaging (原生消息传递)** 技术开发的 Chrome 浏览器扩展与本地服务项目。

能够定时抓取已登录网站的 Cookie，并以 HTTP Header String 格式（`key1=value1; key2=value2`）**100% 后台静默写入**到本地电脑的任意绝对路径中。

---

## 📁 代码目录结构

```text
cookie-sync
├── README.md
├── cookie-sync-extension/      # Chrome 扩展程序源码目录
│   ├── background.js           # 后台 Service Worker 脚本
│   ├── manifest.json           # 扩展配置文件 (Manifest V3)
│   ├── popup.html              # 扩展弹窗界面
│   └── popup.js                # 弹窗交互、检测与预览逻辑
└── cookie_writer.py            # 本地静默写入服务脚本 (Python)
```

---

## ✨ 核心功能

* 🛡️ **两步校验机制**：保存任务前必须先“检测并预览 Cookie”，确保已登录且提取成功，防止无效配置。
* ⏱️ **精准周期与启动补偿**：
   * 支持 **分钟**、**小时**、**天** 多维度时间周期设定。
   * **开机自动补偿**：若关机期间定时任务到期，重新打开浏览器时会自动智能补跑同步。
* 📑 **完整的多任务管理**：
   * 支持配置多个网站的独立同步规则。
   * 支持任务的 **启用 / 暂停** 状态切换、编辑、删除（二次确认）与一键 全部同步。
* 📄 **标准 Header String 输出**：导出的 Cookie 形如 sessionid=abc12345; token=xyz789，可直接粘贴至 Python Requests、Curl、Postman 等工具使用。
* 🚀 **真正的 100% 本地静默落盘**：
   * ✅ 支持任意绝对路径（如 /Users/xxx/Desktop/cookies.txt 或 D:\data\cookies.txt）。
   * ✅ 绝对零弹窗：不弹出系统“另存为”对话框，无需修改 Chrome 下载设置。
   * ✅ 自动递归建目录：目标路径的上级文件夹不存在时会自动递归创建。


---

## 🚀 安装与配置教程

假设你已将本仓库克隆（Clone）到本地磁盘：
* **macOS 路径示例**：`/Users/你的用户名/cookie-sync`
* **Windows 路径示例**：`C:\cookie-sync`

---

### 第一步：配置本地 Native Messaging 宿主服务

根据你的操作系统，完成以下对应配置：

####  macOS 系统配置步骤

1. **赋予 Python 脚本执行权限**：
   ```bash
   cd ~/cookie-sync
   chmod +x cookie_writer.py
   ```

2. **创建 Chrome Native Hosts 目录（若不存在）：**
   ```bash
    mkdir -p ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/
   ```
3. **创建主机注册配置文件：**
    ```bash
    nano ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/com.cookie.sync.json
    ```

   写入以下内容（请将 **你的用户名** 和 **你的插件ID** 替换为实际值）：

   ```json
   {
      "name": "com.cookie.sync",
      "description": "Cookie Local Silent Writer Host for macOS",
      "path": "/Users/你的用户名/cookie-sync/cookie_writer.py",
      "type": "stdio",
      "allowed_origins": [
      "chrome-extension://你的插件ID/"
      ]
   }
   ```

#### 💻 Windows 系统配置步骤
1. **创建入口批处理文件：**

   在仓库根目录 C:\cookie-sync\ 下创建 cookie_writer.bat 文件：

   ```bash
   @echo off
   python "C:\cookie-sync\cookie_writer.py"
   ```

2. **创建主机注册配置文件：**

   在仓库根目录 C:\cookie-sync\ 下创建 com.cookie.sync.json 文件（请将 **你的插件ID** 替换为实际值）：

   ```json
   {
      "name": "com.cookie.sync",
      "description": "Cookie Local Silent Writer Host for Windows",
      "path": "C:\\cookie-sync\\cookie_writer.bat",
      "type": "stdio",
      "allowed_origins": [
         "chrome-extension://你的插件ID/"
      ]
   }
   ```

3. **将主机写入注册表：**


* 按 <kbd>Win</kbd> + <kbd>R</kbd>，输入 `regedit` 回车打开注册表编辑器。
* 定位到路径：`HKEY_CURRENT_USER\Software\Google\Chrome\NativeMessagingHosts\`
* 在其下方新建一个项（**Key**），名称为：`com.cookie.sync`
* 点击该项，在右侧将 (默认) 字符串值修改为配置文件的绝对路径：

   ```text
   C:\cookie-sync\com.cookie.sync.json。
   ```

###  第二步：在 Chrome 中加载扩展程序
1. 打开 Chrome 浏览器，在地址栏输入 `chrome://extensions/` 并回车。
2. 开启页面右上角的 “开发者模式” (`Developer mode`)。
3. 点击左上角的 “加载已解压的扩展程序” (`Load unpacked`)。
4. 选择本仓库中的 `cookie-sync-extension` 源码文件夹。
5. **获取插件 ID**：加载成功后，复制卡片中生成的 **ID**（如 `abcdefghijklmnopqrstuvwxyz123456`）。
6. **更新配置文件**：将复制的插件 ID 回填到第一步中的 `com.cookie.sync.json` 的 `allowed_origins` 中，并保存！

## 📖 使用操作说明

1. **打开面板**：点击 Chrome 右上角工具栏中的扩展图标。
2. **新建任务**：点击右上角 **「+ 新建」** 展开配置卡片。
 * **第一步：检测并预览**：输入已登录网站的 URL（如 https://github.com ），点击 **「第一步：检测并预览 Cookie」**。提取成功后下方将展示预览，同时解锁保存按钮。
 * **第二步：保存任务**：填入本地保存的绝对路径（如 ~/Desktop/github_cookie.txt）并选择同步周期，点击 **「第二步：确认保存」**。
3. **日常管理**：
 * **同步**：点击单个任务卡片上的「同步」按钮可立即手动触发一次。
 * **全部同步**：点击顶部的「全部同步」可一次性触发所有启用中的任务。
 * **暂停 / 启用**：点击「暂停」后该任务将停止后台定时同步，且在全部同步中被跳过。
 * **编辑 / 删除**：点击「编辑」可重新调整参数；点击「删除」会有二次弹窗确认，避免误操作。



## 🛠️ 常见问题与排查 (Troubleshooting)


| 状态栏报错提示 | 原因分析 | 解决方案 |
| --- | --- | --- |
| `错误: Specified native messaging host not found.` | Chrome 未能找到注册的 `com.cookie.sync.json` 配置文件。 |<ul><li>macOS：检查 json 是否正确放置在 ~/Library/Application Support/Google/Chrome/NativeMessagingHosts/ 目录下。</li><li>Windows：检查注册表路径与 (默认) 键值是否正确指向 json 文件的绝对路径。</li></ul>|
| `错误: Access to native messaging host denied.` | 配置文件中的 `allowed_origins` 与当前扩展程序 ID 不匹配。 |前往 `chrome://extensions/` 重新复制插件 ID，更新 json 中的 `chrome-extension://你的ID/` 并重启 Chrome 浏览器。 |
| `错误: Native host has exited.` | 本地 Python 脚本缺乏执行权限，或当前系统未安装 Python。 |<ul><li>macOS：在终端执行 chmod +x ~/cookie-sync/cookie_writer.py 补充可执行权限。</li><li>Windows：打开 CMD 终端输入 python --version，确认 Python 已加入系统环境变量 PATH 中。</li></ul>|
| `错误: Cookie读取失败 或 结果为空` | 目标网站未登录，或输入的 URL 域名/协议有误。 | 在 Chrome 当前标签页打开该网站并完成登录，然后确认 URL 输入正确（需包含协议，如 `https://`）。 |



## 📄 许可证
MIT License
