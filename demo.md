# Secure Online Food Ordering System — Windows 环境无 Slide 演示指南 (demo.md)

本指南针对 **8月10日项目现场答辩演示** 编写，专用于指导在 **Native Windows PowerShell** 环境下完成全流程实机演示。本项目演示严格遵循“无需 Slide 幻灯片，全过程基于实机浏览器、命令行与代码讲解”的要求。

---

## 一、演示准备阶段 (pgAdmin 4 + Windows PowerShell 环境配置)

在 Windows 机器上按以下步骤完成 **pgAdmin 4 图形化数据库初始化** 及 **PowerShell 项目启动**：

### 1.1 pgAdmin 4 数据库与用户角色创建 (GUI / Query Tool 操作)

启动 `pgAdmin 4`，输入 Master Password 连接到本地 PostgreSQL 服务器，执行以下操作：

- **创建数据库**：在左侧对象树右键点击 `Databases` -> `Create` -> `Database...` -> 数据库名填 `food_ordering_dev` -> 点击 Save。
- **创建用户角色与授权**：点击顶部菜单 `Tools` -> `Query Tool`，运行以下 SQL：
  ```sql
  CREATE ROLE food_ordering_migrator WITH LOGIN SUPERUSER PASSWORD 'MigrationPassword123!';
  CREATE ROLE food_ordering_app WITH LOGIN PASSWORD 'AppPassword123!';
  CREATE ROLE food_ordering_backup WITH LOGIN PASSWORD 'BackupPassword123!';
  GRANT ALL PRIVILEGES ON DATABASE food_ordering_dev TO food_ordering_migrator;
  ```

### 1.2 PowerShell 项目依赖与迁移初始化

打开第一个原生 Windows PowerShell 窗口，进入项目目录执行：

```powershell
cd secure-online-food-ordering-system

# 1. 生成可直接运行的环境配置文件 .env (避免 replace_with_* 占位符报错)
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

# 3. 执行角色权限应用、表结构迁移与假数据导入
npm run db:roles
npm run db:migrate
npm run db:seed
```

### 1.3 启动主安全应用 (窗口 1)

```powershell
npm start
```
- **安全应用访问地址**：[http://127.0.0.1:3000](http://127.0.0.1:3000)
- **健康检查接口**：[http://127.0.0.1:3000/health](http://127.0.0.1:3000/health)

### 1.4 启动隔离脆弱演示环境 (窗口 2)

#### 步骤 A：在 pgAdmin 4 中创建脆弱环境数据库与账号

- **创建数据库**：在左侧对象树右键点击 `Databases` -> `Create` -> `Database...` -> 数据库名填 `food_ordering_vulnerable_demo` -> 点击 Save。
- **创建用户角色与授权**：点击顶部菜单 `Tools` -> `Query Tool`，运行以下 SQL：
  ```sql
  CREATE ROLE food_ordering_vulnerable_demo WITH LOGIN SUPERUSER PASSWORD 'DemoPassword123!';
  GRANT ALL PRIVILEGES ON DATABASE food_ordering_vulnerable_demo TO food_ordering_vulnerable_demo;
  ```

#### 步骤 B：在 PowerShell 窗口 2 中配置环境并启动
打开第 2 个原生 Windows PowerShell 窗口，进入项目目录后执行：

```powershell
# 1. 进入项目根目录
cd secure-online-food-ordering-system

# 2. 确保 demo\vulnerable 目录存在并生成配置文件
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

# 3. 初始化脆弱环境演示数据库与假数据
npm run demo:vulnerable:setup

# 4. 启动隔离脆弱演示环境
npm run demo:vulnerable:start
```
- **脆弱演示环境访问地址**：[http://127.0.0.1:3100](http://127.0.0.1:3100)

### 1.5 演示预设测试账号

- **顾客账号**：`customer1@example.com` / 密码：`CustomerPass123!`
- **管理员账号**：`admin1@example.com` / 密码：`AdminPass123!`

---

## 二、10 步 Windows 实机现场演示流程 (10-Step Live Demonstration Checklist)

### 步骤 1：演示双环境架构与隔离安全互锁展示

- **演示动作**：
  1. 在 Chrome/Edge 浏览器中并排打开 `http://127.0.0.1:3000` (安全版) 与 `http://127.0.0.1:3100` (脆弱版)。
  2. 指向 3100 端口顶部的醒目红色警告 Banner：`"EDUCATIONAL VULNERABLE DEMO — LOCAL LOOPBACK ONLY"`。
- **源码对应**：`demo/vulnerable/server.js`，`demo/vulnerable/config.js`
- **截图参考**：`evidence/day-06/2026-08-08-windows-clone-run.png`
- **讲解台词**：“我们采用了严格的隔离互锁机制：脆弱演示版本仅允许在本地 loopback 运行，必须带有 DEMO 标志并连接独立的只读假数据库，绝不会在生产环境开启。”

---

### 步骤 2：脆弱环境 SQL 注入演示 (Insecure SQL Injection)

- **演示动作**：
  1. 访问 `http://127.0.0.1:3100/scenarios/sql-injection`。
  2. 点击页面上的按钮：运行被允许的只读 Payload `does-not-match%' OR '1'='1' -- `。
- **预期现象**：不需要匹配搜索关键词，未过滤的注入 Payload 直接拼接进入 SQL，查询并输出了数据库中所有的菜品列表数据！
- **源码对应**：`demo/vulnerable/app.js` (展示字符串直接拼接的 Raw SQL 语句 `WHERE name ILIKE '%${query}%'`)
- **截图参考**：`evidence/day-05/2026-08-07-login-sqli-insecure.png`
- **讲解台词**：“在脆弱版本中，未经过滤的输入直接拼接进 SQL 语句，改变了 WHERE 条件的逻辑结构，导致输出了整张表的数据。”
- **故障恢复**：若需重置演示库，在 PowerShell 窗口 2 运行 `npm run demo:vulnerable:reset`。

---

### 步骤 3：安全登录与 SQL 注入防御对比 (Secure SQL Injection Defense)

- **演示动作**：
  1. 访问 `http://127.0.0.1:3000/login`。
  2. 在 Email 框输入 Payload：`' OR '1'='1`
  3. Password 框输入：`anything`
  4. 点击登录。
- **预期现象**：登录失败，系统呈现受控的通用安全提示：`"Email or password is incorrect."`，无任何数据库错误信息泄露。
- **源码对应**：`src/repositories/user-repository.js` (展示 `pg` 库的 `$1` 参数化绑定查询)
- **截图参考**：`evidence/day-05/2026-08-07-login-sqli-secure.png`
- **讲解台词**：“在主安全应用中，我们使用固定结构的参数化查询，所有用户输入均被当作纯数据参数（$1）处理，从根本上杜绝了 SQL 注入攻击。”

---

### 步骤 4：脆弱 XSS 脚本执行演示 (Insecure XSS Attack)

- **演示动作**：
  1. 访问 `http://127.0.0.1:3001/search?q=<script>alert('XSS-Demo')</script>`
     或在输入框提交：`<svg onload=alert(1)>`
- **预期现象**：浏览器立即弹窗执行注入的 JavaScript 代码。
- **源码对应**：`demo/vulnerable/views/search.ejs` (展示非安全的未转义渲染 `<%- %>`)
- **截图参考**：`evidence/day-05/2026-08-07-xss-insecure.png`
- **讲解台词**：“脆弱版本使用了未转义的 EJS 插值 `<%- %>`，导致攻击者嵌入的脚本在其他用户浏览器中被非法执行。”

---

### 步骤 5：安全 XSS 实体转义与 CSP 拦截对比 (Secure XSS Prevention)

- **演示动作**：
  1. 访问 `http://127.0.0.1:3000/search?q=<script>alert('XSS-Demo')</script>`
- **预期现象**：Payload 被安全转义为普通文本显示在页面上，没有弹窗触发；检查 Network Header 可以看到 `Content-Security-Policy: default-src 'self'`。
- **源码对应**：`views/search.ejs` (使用 `<%= %>`)，`src/app.js` (Helmet CSP 配置)
- **截图参考**：`evidence/day-05/2026-08-07-xss-secure.png`
- **讲解台词**：“安全应用结合了 EJS 上下文 HTML 转义（`<%= %>`）与严格的 CSP 请求头，形成了多层深度防御机制。”

---

### 步骤 6：STRIDE 威胁模型解析 (STRIDE Threat Model)

- **演示动作**：
  在编辑器中打开文档 [docs/login-stride-threat-model.md](file:///Users/eldonshen/Desktop/2026/2026spring/8265/groupWork/project/docs/login-stride-threat-model.md)，向评委讲解登录系统的 6 大维度威胁与应对措施：
  1. **Spoofing (仿冒)**：通过 `scrypt` 强哈希、防爆破延迟及服务器端 Session 防范。
  2. **Tampering (篡改)**：通过参数化 SQL 与 cryptographically random CSRF Token 防范。
  3. **Repudiation (抵赖)**：通过持久化脱敏审计日志记录关键操作。
  4. **Information Disclosure (信息泄露)**：通过通用错误提示及 `HttpOnly` / `SameSite` Secure Cookie 防范。
  5. **Denial of Service (拒绝服务)**：通过请求体限额与登录失败延迟防护。
  6. **Elevation of Privilege (特权提升)**：通过服务器端 `requireAdmin` 中间件与订单权属校验（`user_id` + `order_id`）防范。
- **讲解台词**：“我们的 STRIDE  threat model 覆盖了登录与身份验证全流程，每一项威胁都精确映射到了源码中的防护中间件。”

---

### 步骤 7：数据库与信息安全防御展示 (Database & InfoSec)

- **演示动作**：
  1. **展示最小权限角色与 pgAdmin 4 结构**：打开 `db/roles.sql`，或在 **pgAdmin 4** 左侧面板中展开 `Databases` -> `food_ordering_dev` -> `Schemas` -> `public` -> `Tables` 展示生成的 5 个核心表结构（`users`, `food_items`, `orders`, `order_items`, `audit_logs`），并说明运行期账号 `food_ordering_app` 仅拥有受限的 DML (`SELECT`, `INSERT`, `UPDATE`) 权限，无任何 DDL 或 Superuser 权限。
  2. **展示脱敏审计日志**：登录管理员账号进入 `http://127.0.0.1:3000/admin/audit`（或在 pgAdmin 4 执行 `SELECT * FROM audit_logs;`），展示登录、订单更新日志，其中敏感参数均被掩码为 `[REDACTED]`。
  3. **演示 Windows 下备份与恢复**：在 PowerShell 窗口 1 中运行：
     ```powershell
     # 备份数据库
     npm run db:backup

     # 恢复数据库
     npm run db:restore -- backups\food-ordering-2026-08-07T12-00-00.000Z.dump
     ```
- **截图参考**：`evidence/day-06/2026-08-08-audit-backup-restore.png`
- **讲解台词**：“我们实现了遵循最小权限原则的数据库角色隔离、敏感数据脱敏的持久化审计，以及跨平台单命令数据备份与恢复。”

---

### 步骤 8：密码学应用解析 (Cryptography)

- **演示动作**：
  1. 打开文档 [docs/cryptography.md](file:///Users/eldonshen/Desktop/2026/2026spring/8265/groupWork/project/docs/cryptography.md)。
  2. 展示 `src/security/passwords.js` 源码中的密码处理函数：
     - 使用异步 `scrypt()` 哈希算法；
     - 为每个密码生成独立的 16 字节随机 Salt；
     - 使用 `crypto.timingSafeEqual()` 进行常数时间比较，防止时序侧信道攻击 (Timing Attack)。
- **讲解台词**：“我们采用 Node.js 原生 `scrypt` 算法搭配加盐和常数时间比对，确保密码存储与比对具有密码学安全性；生产部署边界强制要求 HTTPS/TLS。”

---

### 步骤 9：架构设计决策答辩 (Design Decisions)

- **演示动作**：回答评委关于技术选型与设计决策的提问：
  - **为什么选择 Stateful PostgreSQL Session 而非 JWT？**
    答：Food Ordering 系统需要强力的实时登出与会话撤销能力，Stateful Session 允许服务端在登出或异常时即时销毁会话，避免 JWT 无法实时撤销的安全隐患。
  - **为什么选择参数化 SQL 而非重量级 ORM？**
    答：参数化原生 SQL 具有极高的性能透明度与可控性，能够精确设计查询逻辑并规避 ORM 可能引入的隐藏查询漏洞。

---

### 步骤 10：演示完毕与环境优雅关闭 (Shutdown)

- **演示动作**：在 PowerShell 窗口中运行关闭命令：
  ```powershell
  npm run shutdown
  ```
- **预期现象**：系统控制台输出优雅关闭日志，端口 3000 与 3001 进程安全释放。
- **讲解台词**：“以上是 Secure Online Food Ordering System 的完整功能与安全展示，感谢各位评委，系统已优雅关闭。”

---

## 三、演示应急预案与检查清单 (Windows Troubleshooting Checklist)

| 异常情况 | 快速排查与解决办法 (PowerShell) |
| --- | --- |
| **PostgreSQL 服务未启动** | 在管理员 PowerShell 中运行：`Start-Service -Name "postgresql-x64-16"` |
| **`psql` / `createdb` 报错未找到** | 手动指定环境变量：`$env:POSTGRES_BIN="C:\Program Files\PostgreSQL\16\bin"` |
| **端口 3000 或 3001 被占用** | 运行关闭脚本：`npm run shutdown` 或手动结束 Node 进程：`Stop-Process -Name node -Force` |
| **脆弱演示库数据混乱** | 在窗口 2 运行重置脚本：`npm run demo:vulnerable:reset` |
| **主安全库需要重置恢复** | 运行初始化命令：`npm run db:migrate` 与 `npm run db:seed` |
