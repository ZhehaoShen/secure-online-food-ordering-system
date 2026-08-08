# Secure Online Food Ordering System — Windows 环境无 Slide 双系统 A/B 对照演示指南 (demo.md)

本指南针对 **项目现场答辩演示** 编写，专用于指导在 **Native Windows PowerShell** 环境下完成全流程实机双系统 A/B 对照演示。本项目演示严格遵循“无需 Slide 幻灯片，全过程基于实机浏览器双窗口、命令行与代码讲解”的要求。

---

## 一、双系统架构与演示准备阶段

本项目采用 **双系统真实对比（Twin-System A/B Experiment）** 架构，两端保留相同的 Northstar Kitchen 主题、导航菜单、页面路径与表单结构，仅在安全防护实现与运行结果上产生鲜明对比：

- **Secure 应用程序 (Port 3000)**：`http://127.0.0.1:3000` — 包含完整防御（参数化 SQL、EJS 实体转义、CSP、RBAC 越权防护、脱敏审计、Argon2id 哈希）。Header 显示绿色标识 `SECURE APPLICATION · PORT 3000`。
- **Vulnerable 演示系统 (Port 3100)**：`http://127.0.0.1:3100` — 故意包含已知安全漏洞（Raw SQL 拼接、未转义 EJS 渲染、缺少中间件鉴权、明文敏感数据）。Header 显示红色标识 `INTENTIONALLY VULNERABLE · LOCAL DEMO · PORT 3100`。

---

### 1.1 pgAdmin 4 主安全数据库与角色创建 (GUI / Query Tool 操作)

启动 `pgAdmin 4`，输入 Master Password 连接到本地 PostgreSQL 服务器，执行以下操作：

- **创建数据库**：在左侧对象树右键点击 `Databases` -> `Create` -> `Database...` -> 数据库名填 `food_ordering_dev` -> 点击 Save。
- **创建用户角色与授权**：点击顶部菜单 `Tools` -> `Query Tool`，运行以下 SQL：
  ```sql
  CREATE ROLE food_ordering_migrator WITH LOGIN SUPERUSER PASSWORD 'MigrationPassword123!';
  CREATE ROLE food_ordering_app WITH LOGIN PASSWORD 'AppPassword123!';
  CREATE ROLE food_ordering_backup WITH LOGIN PASSWORD 'BackupPassword123!';
  GRANT ALL PRIVILEGES ON DATABASE food_ordering_dev TO food_ordering_migrator;
  ```

### 1.2 主安全应用环境配置与初始化 (窗口 1)

打开第一个原生 Windows PowerShell 窗口，进入项目目录执行：

```powershell
cd secure-online-food-ordering-system

# 1. 生成主安全应用的环境配置文件 .env
Set-Content .env @"
NODE_ENV=development
HOST=127.0.0.1
PORT=3000
APP_BASE_URL=http://127.0.0.1:3000
TRUST_PROXY=false

DATABASE_HOST=127.0.0.1
DATABASE_PORT=5432
DATABASE_NAME=food_ordering_dev
DATABASE_USER=food_ordering_app
DATABASE_PASSWORD=AppPassword123!
DATABASE_SSL=false

MIGRATION_DATABASE_USER=food_ordering_migrator
MIGRATION_DATABASE_PASSWORD=MigrationPassword123!

SESSION_SECRET=a_secure_random_session_secret_value_32_bytes_long!
SESSION_COOKIE_NAME=food_ordering_sid
SESSION_IDLE_TIMEOUT_MINUTES=30
SESSION_SECURE_COOKIE=false

LOG_LEVEL=info
BACKUP_DIRECTORY=backups
"@

# 2. 安装项目依赖
npm ci --ignore-scripts

# 3. 执行数据库初始化 (表结构迁移与假数据导入)
npm run db:setup
```

### 1.3 启动主安全应用 (窗口 1)

```powershell
npm start
```
- **安全应用访问地址**：[http://127.0.0.1:3000](http://127.0.0.1:3000)
- **健康检查接口**：[http://127.0.0.1:3000/health](http://127.0.0.1:3000/health)

---

### 1.4 启动隔离脆弱演示环境 (窗口 2)

**是的，窗口 2 同样需要专门的配置与初始化**。因为脆弱演示系统是完全独立隔离的服务（运行在 3100 端口，使用独立的演示数据库），不能也不应该与主安全应用共享配置文件或数据库。

#### 步骤 A：在 pgAdmin 4 中创建脆弱演示库与角色
- **创建数据库**：右键点击 `Databases` -> `Create` -> `Database...` -> 数据库名填 `food_ordering_vulnerable_demo` -> 点击 Save。
- **创建角色与授权**：在 pgAdmin 4 `Query Tool` 中运行：
  ```sql
  CREATE ROLE food_ordering_vulnerable_demo WITH LOGIN SUPERUSER PASSWORD 'DemoPassword123!';
  GRANT ALL PRIVILEGES ON DATABASE food_ordering_vulnerable_demo TO food_ordering_vulnerable_demo;
  ```

#### 步骤 B：在 PowerShell 窗口 2 中配置与启动
打开第 2 个原生 Windows PowerShell 窗口，进入项目目录后执行：

```powershell
# 1. 进入项目根目录
cd secure-online-food-ordering-system

# 2. 创建 demo\vulnerable\.env 专用配置文件 (启用本地安全互锁标志)
New-Item -ItemType Directory -Path "demo\vulnerable" -Force
Set-Content demo\vulnerable\.env @"
VULNERABLE_DEMO_MODE=local-classroom-only
VULNERABLE_DEMO_DATA_CLASSIFICATION=fictional-only
VULNERABLE_DEMO_DATABASE_MARKER=isolated-vulnerable-demo
VULNERABLE_DEMO_HOST=127.0.0.1
VULNERABLE_DEMO_PORT=3100
VULNERABLE_DEMO_DATABASE_HOST=127.0.0.1
VULNERABLE_DEMO_DATABASE_PORT=5432
VULNERABLE_DEMO_DATABASE_NAME=food_ordering_vulnerable_demo
VULNERABLE_DEMO_DATABASE_USER=food_ordering_vulnerable_demo
VULNERABLE_DEMO_DATABASE_PASSWORD=DemoPassword123!
"@

# 3. 初始化脆弱演示库表结构与假数据
npm run demo:vulnerable:setup

# 4. 启动隔离脆弱演示环境
npm run demo:vulnerable:start
```
- **脆弱演示环境访问地址**：[http://127.0.0.1:3100](http://127.0.0.1:3100)

---

### 1.5 演示预设测试账号 (Fictional Demo Credentials)

演示系统已在数据库初始化时预置了以下测试账号（密码均已通过 Node.js `scrypt` 强哈希加密存储）：

| 系统环境 | 角色 (Role) | 登录 Email | 登录密码 | 权限与用途描述 |
| :--- | :--- | :--- | :--- | :--- |
| **Secure 端 (`:3000`)** | **顾客** (Customer) | `avery.customer@example.test` | `CustomerPass123!` | 普通顾客身份，可浏览菜品、加入购物车、下单与查看订单 |
| **Secure 端 (`:3000`)** | **管理员** (Admin) | `casey.admin@example.test` | `AdminPass123!` | 系统管理员身份，可访问后台管理与审计日志 (`/admin/audit-logs`) |
| **Vulnerable 端 (`:3100`)** | **顾客** (Customer) | `customer@vulnerable-demo.test` | `CustomerPass123!` | 脆弱演示端顾客账号 |
| **Vulnerable 端 (`:3100`)** | **管理员** (Admin) | `admin@vulnerable-demo.test` | `AdminPass123!` | 脆弱演示端管理员账号（亦可通过 SQL 注入 Payload 直接绕过） |

> **提示**：在 Secure 端 (`:3000`)，您也可以直接在浏览器访问 [http://127.0.0.1:3000/register](http://127.0.0.1:3000/register) 自主注册任意新顾客账号进行测试。

---

## 二、双系统 A/B 实机现场演示流程 (5-Step Demonstration Flow)

演示过程中，在浏览器中**左右分屏并排打开**两个系统：
- 左侧窗口：`http://127.0.0.1:3100` (Vulnerable App, 红色 Badge)
- 右侧窗口：`http://127.0.0.1:3000` (Secure App, 绿色 Badge)

---

### 演示 1：登录 SQL 注入攻击与防御对照 (SQL Injection)

- **操作步骤**：
  1. **左侧 Vulnerable 端 (`:3100/login`)**：
     - 在 Email 输入框中填入 Payload：`' OR '1'='1`
     - 密码输入框保留为空（或任意填写），点击登录按钮。
     - **演示现象**：成功绕过身份认证！无需输入密码即以管理员身份成功登录进入系统。
     - **原因解析**：后台代码使用原生字符串拼接 SQL（`WHERE email = '${email}'`），Payload 改变了查询条件逻辑使 `WHERE` 子句永远为真。
  2. **右侧 Secure 端 (`:3000/login`)**：
     - 在 Email 输入框中填入相同 Payload：`' OR '1'='1`
     - 密码任意填写，点击登录。
     - **演示现象**：登录失败，页面显示统一安全提示：`"Email or password is incorrect."`。
     - **原因解析**：源码使用 PostgreSQL 参数化绑定查询（`WHERE email = $1`），输入被作为纯文本字符串处理，杜绝注入。
- **源码对照**：
  - Vulnerable: `demo/vulnerable/app.js` (Raw SQL 拼接)
  - Secure: `src/repositories/user-repository.js` (`pg` 参数绑定 `$1`)

---

### 演示 2：反射型 XSS 攻击与实体转义对照 (Reflected XSS)

- **操作步骤**：
  1. **左侧 Vulnerable 端 (`:3100/search`)**：
     - 在搜索框中输入 XSS Payload：`<script>alert('XSS-Vulnerable-Demo')</script>`，回车提交。
     - **演示现象**：浏览器立即弹出 `alert` 警告框，证明恶意脚本在客户端成功执行！
     - **原因解析**：页面渲染使用了未转义的 EJS 标签 `<%- query %>`。
  2. **右侧 Secure 端 (`:3000/search`)**：
     - 在搜索框中输入相同 Payload：`<script>alert('XSS-Vulnerable-Demo')</script>`，回车提交。
     - **演示现象**：页面没有弹窗，输入字符串被安全转义为 HTML 文本显示；按 `F12` 检查 HTTP Response Header（Firefox 开发者工具 -> 「网络 Network」 标签页 -> 点击请求 -> 「标头 Headers」）包含 `Content-Security-Policy: default-src 'self'`。
     - **原因解析**：视图采用转义标签 `<%= query %>` + 严格 Helmet CSP 请求头。
- **源码对照**：
  - Vulnerable: `demo/vulnerable/views/search.ejs` (`<%- query %>`)
  - Secure: `views/search.ejs` (`<%= query %>`) 与 `src/app.js` (Helmet CSP)

---

### 演示 3：STRIDE 威胁模型与 Session/CSRF 安全解析

- **操作步骤**：
  1. 打开 Windows Firefox 开发者工具 (F12 或 Ctrl+Shift+I) -> 「存储 (Storage)」 -> 「Cookie」，对比两端 Session Cookie 配置：
     - **Vulnerable 端 (`:3100`)**：Cookie 缺失 `HttpOnly` / `SameSite` 属性，容易被 JavaScript 脚本读取或遭受 CSRF 攻击。
     - **Secure 端 (`:3000`)**：Cookie 强制设置 `HttpOnly` (防止 XSS 窃取)、`SameSite=Lax`，表单包含 `_csrf` 随机 Token 校验。
  2. 打开文档 [docs/login-stride-threat-model.md](file:///Users/eldonshen/Desktop/2026/2026spring/8265/groupWork/project/docs/login-stride-threat-model.md)，讲解 STRIDE 6 大维度应对措施：
     - **Spoofing (仿冒)**：`scrypt` / `Argon2id` 慢哈希 + Session 防范。
     - **Tampering (篡改)**：参数化 SQL + CSRF Token。
     - **Repudiation (抵赖)**：脱敏审计日志持久化。
     - **Information Disclosure (信息泄露)**：通用错误提示 + `HttpOnly` Cookie。
     - **Denial of Service (拒绝服务)**：请求体限额 + 登录防爆破延迟。
     - **Elevation of Privilege (特权提升)**：服务器端 `requireAdminRole` 中间件与订单 `user_id` 归属校验。

---

### 演示 4：数据库访问控制与敏感数据脱敏 (Database & InfoSec)

- **操作步骤**：
  1. **访问控制与越权测试**：
     - **Vulnerable 端 (`:3100/admin/orders`)**：未登录的普通用户直接访问后台管理路径，系统直接输出所有客户订单及敏感审计日志。
     - **Secure 端 (`:3000/admin/orders`)**：未授权访问直接被 `requireAdminRole` 中间件拦截并返回 `403 Forbidden`。
  2. **审计日志与脱敏**：
     - 在 Secure 端以管理员登录访问 `/admin/audit-logs`，展示所有登录与管理日志，敏感字段如密码、Session 均被掩码为 `[REDACTED]`。
  3. **Windows 数据库备份与恢复**：
     - 在 PowerShell 窗口 1 中测试单命令备份与恢复：
       ```powershell
       npm run db:backup
       npm run db:restore -- backups\food-ordering-xxxx-xx-xx.dump
       ```

---

### 演示 5：密码学应用与常数时间比对 (Cryptography)

- **操作步骤**：
  1. 打开文档 [docs/cryptography.md](file:///Users/eldonshen/Desktop/2026/2026spring/8265/groupWork/project/docs/cryptography.md)。
  2. 展示 `src/security/passwords.js` 源码中的密码哈希与比对函数：
     - 使用 `scrypt` / `Argon2id` 强哈希算法；
     - 独立 16-byte 随机 Salt 盐值；
     - 使用 `crypto.timingSafeEqual()` 进行常数时间比较，防止 Timing Attack（时序侧信道攻击）。

---

## 三、演示完毕与环境优雅关闭 (Shutdown)

在 PowerShell 窗口中运行统一关闭命令：

```powershell
npm run shutdown
```

- **预期现象**：后台脚本自动检索并优雅关闭 Port 3000 (Secure) 与 Port 3100 (Vulnerable) 进程，释放资源。

---

## 四、Windows 快速排查与应急预案 (Troubleshooting)

| 异常情况 | 快速排查与解决办法 (PowerShell) |
| --- | --- |
| **PostgreSQL 服务未启动** | 在管理员 PowerShell 中运行：`Start-Service -Name "postgresql-x64-16"` |
| **`psql` / `createdb` 报错未找到** | 手动指定环境变量：`$env:POSTGRES_BIN="C:\Program Files\PostgreSQL\16\bin"` |
| **端口 3000 或 3100 被占用** | 运行关闭脚本：`npm run shutdown` 或手动结束 Node 进程：`Stop-Process -Name node -Force` |
| **脆弱演示库需要重置** | 在窗口 2 运行：`npm run demo:vulnerable:setup` |
| **主安全库需要重置** | 运行初始化命令：`npm run db:migrate` 与 `npm run db:seed` |
