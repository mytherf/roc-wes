# ROC-WES - 企业级可视化仓库执行系统

基于 Vue 3 + Vite + AntV X6 v3 构建的仓库执行系统，支持流程图编辑、IoT 组件、工作流编排、实时数据绑定、ECDSA 安全授权等企业级功能。

## 📋 目录

- [功能特性](#功能特性)
- [技术栈](#技术栈)
- [快速开始](#快速开始)
- [环境变量](#环境变量)
- [授权机制](#授权机制)
- [项目结构](#项目结构)
- [部署指南](#部署指南)
- [性能优化](#性能优化)
- [测试](#测试)
- [贡献指南](#贡献指南)
- [许可证](#许可证)

---

## 🚀 功能特性

### 核心编辑器
- ✅ 可视化流程图编辑器（拖拽、连线、框选）
- ✅ 自定义 Vue 节点组件（支持任意复杂交互）
- ✅ Pinia 状态管理与数据持久化（localStorage）
- ✅ 撤销/重做（Undo/Redo）
- ✅ 复制/粘贴/删除（快捷键支持）

### IoT 组件库
- ✅ ECharts 仪表盘（实时数据展示）
- ✅ 实时折线图（动态数据曲线）
- ✅ 指示灯（运行/停止/告警/故障）
- ✅ 开关、滑块等控件（可扩展）

### 工作流编排
- ✅ 开始/结束节点
- ✅ 条件判断（多分支表达式）
- ✅ 定时器节点（等待指定时间）
- ✅ HTTP 请求节点（支持 GET/POST/PUT/DELETE）
- ✅ 自定义代码节点（JavaScript 沙箱执行）
- ✅ DAG 校验器（环检测、孤立节点检查）

### 实时数据
- ✅ WebSocket 数据订阅（自动重连）
- ✅ 模拟数据服务（开发测试用）
- ✅ 数据绑定配置（`binding` 字段驱动）

### 授权与安全
- ✅ ECDSA P-256 + SHA-256 数字签名
- ✅ 许可证验证与激活（状态栏集成）
- ✅ 功能权限控制（侧边栏自动禁用）
- ✅ 节点数量限制（超限提示）

### 性能优化
- ✅ 虚拟渲染（视口裁剪，仅渲染可视区域）
- ✅ Scroller 滚动画布（无限平移）
- ✅ 批量更新（`batchUpdate`）
- ✅ 代码分割（按需加载）

---

## 🛠️ 技术栈

| 类别 | 技术 | 版本 |
|------|------|------|
| 框架 | Vue 3 | ^3.4.0 |
| 构建工具 | Vite | ^5.0.0 |
| 图引擎 | AntV X6 | ^3.0.0 |
| 状态管理 | Pinia | ^2.1.0 |
| 图表库 | ECharts | ^5.4.0 |
| 加密库 | @noble/curves | ^2.2.0 |
| 哈希库 | @noble/hashes | ^2.2.0 |
| 语言 | TypeScript | ^5.0.0 |

---

## ⚡ 快速开始

### 1. 克隆项目
```bash
git clone https://github.com/mytherf/roc-wes.git
cd roc-wes
```

### 2. 安装依赖
```bash
npm install
```

### 3. 配置环境变量（可选）
创建 `.env.local` 文件：
```env
VITE_APP_TITLE=ROC-WES
VITE_APP_VERSION=1.0.0
# 可选：覆盖默认授权公钥
VITE_LICENSE_PUBLIC_KEY=04d5a2c8...
```

### 4. 启动开发服务器
```bash
npm run dev
```
访问 `http://localhost:5173`

### 5. 生产构建
```bash
npm run build
```
构建产物位于 `dist/` 目录。

### 6. 预览生产构建
```bash
npm run preview
```

---

## 🌍 环境变量

| 变量名 | 说明 | 默认值 | 是否必需 |
|--------|------|--------|----------|
| `VITE_APP_TITLE` | 应用标题 | `ROC-WES` | 否 |
| `VITE_APP_VERSION` | 版本号（显示在状态栏） | `1.0.0` | 否 |
| `VITE_APP_ENV` | 运行环境（`development`/`production`） | `development` | 否 |
| `VITE_LICENSE_PUBLIC_KEY` | 授权公钥（十六进制） | 内置公钥 | 否 |

**使用方式**：
在代码中通过 `import.meta.env.VITE_*` 访问，如 `import.meta.env.VITE_APP_VERSION`。

---

## 🔐 授权机制

### 原理
- 使用 **ECDSA P-256** 曲线 + **SHA-256** 哈希进行数字签名。
- 服务端使用私钥对许可证数据签名，客户端使用内置公钥验证。
- 验证通过后，根据许可证中的 `features` 和 `maxNodes` 控制功能。

### 生成授权码（开发/测试用）
```typescript
import { ECDSAService } from '@/services/ECDSAService'
import { LicenseService } from '@/services/LicenseService'

const keyPair = ECDSAService.generateKeyPair()
const activationCode = LicenseService.generateDemoLicense(keyPair.privateKey)
console.log('🔑 授权码:', activationCode)
console.log('🔐 公钥:', keyPair.publicKey)
```

### 激活授权
在应用底部状态栏中点击“授权管理”，输入授权码即可激活。

### 功能权限控制
- 侧边栏节点根据 `requiredFeature` 字段自动禁用（显示 🔒）。
- 画布中添加节点时自动检查 `maxNodes` 限制。

---

## 📁 项目结构

```
roc-mes/
├── public/                    # 静态资源
├── src/
│   ├── components/            # Vue 组件
│   │   ├── nodes/             # X6 节点组件
│   │   │   ├── CustomCard.vue
│   │   │   ├── GaugeNode.vue
│   │   │   ├── ChartNode.vue
│   │   │   ├── IndicatorNode.vue
│   │   │   ├── WorkflowStartNode.vue
│   │   │   ├── WorkflowEndNode.vue
│   │   │   ├── ConditionNode.vue
│   │   │   ├── TimerNode.vue
│   │   │   ├── HttpRequestNode.vue
│   │   │   └── CustomCodeNode.vue
│   │   ├── X6Canvas.vue       # 画布组件
│   │   ├── Sidebar.vue        # 组件库侧边栏
│   │   ├── PropertyPanel.vue  # 属性面板
│   │   ├── WorkflowToolbar.vue # 工作流工具栏
│   │   └── StatusBar.vue      # 状态栏（含授权管理）
│   ├── services/              # 服务层
│   │   ├── ECDSAService.ts    # ECDSA 加密
│   │   ├── LicenseService.ts  # 授权服务
│   │   ├── DataService.ts     # 数据服务接口
│   │   ├── WebSocketService.ts
│   │   ├── MockDataService.ts
│   │   ├── AnimationService.ts
│   │   ├── WorkflowEngine.ts
│   │   └── DagValidator.ts
│   ├── stores/                # Pinia 状态
│   │   └── editor.ts
│   ├── types/                 # TypeScript 类型
│   │   └── license.ts
│   ├── utils/                 # 工具函数
│   │   └── test-utils.ts
│   ├── tests/                 # 测试文件
│   │   ├── integration.test.ts
│   │   └── performance.test.ts
│   ├── App.vue
│   ├── main.ts
│   └── vite-env.d.ts
├── .env.production            # 生产环境变量
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
└── README.md
```

---

## 🚢 部署指南

### 方式一：静态托管（推荐）

1. **构建项目**：
   ```bash
   npm run build
   ```

2. **部署 `dist/` 目录**：
    - 上传至 Nginx、Apache、CDN 或对象存储（如 AWS S3、阿里云 OSS）。

3. **Nginx 配置示例**（`/etc/nginx/sites-available/scada`）：
   ```nginx
   server {
       listen 80;
       server_name wes.yourdomain.com;
       root /var/www/roc-wes/dist;
       index index.html;

       location / {
           try_files $uri $uri/ /index.html;
       }

       # 启用 Gzip 压缩
       gzip on;
       gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
   }
   ```

4. **启用 HTTPS**（推荐使用 Let's Encrypt）：
   ```bash
   certbot --nginx -d scada.yourdomain.com
   ```

### 方式二：Docker 容器化

创建 `Dockerfile`：
```dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

创建 `nginx.conf`：
```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

构建并运行：
```bash
docker build -t roc-wes .
docker run -d -p 8080:80 roc-wes
```

### 方式三：Vercel / Netlify（一键部署）

- 连接 GitHub 仓库，自动构建部署。
- 配置环境变量 `VITE_APP_VERSION` 等。

---

## ⚡ 性能优化

### 已实现优化
- **虚拟渲染**：只渲染可视区域内的节点和边（`virtual: { enabled: true }`）。
- **Scroller 插件**：提供无限滚动画布，避免大画布卡顿。
- **批量更新**：使用 `graph.batchUpdate()` 批量添加节点/边。
- **代码分割**：将 X6、ECharts、加密库分离为独立 chunk。

### 自定义优化建议
1. **懒加载重组件**：对于大量节点，使用 `defineAsyncComponent`。
2. **减少节点数据冗余**：仅在节点 `data` 中存储必要字段。
3. **使用 `computed` 缓存**：对于频繁计算（如节点数量），使用 `computed`。
4. **Web Worker**（可选）：将工作流引擎执行移至 Worker，避免阻塞 UI。

---

## 🧪 测试

### 运行单元测试
```bash
npm run test
```

### 运行带 UI 的测试
```bash
npm run test:ui
```

### 运行覆盖率测试
```bash
npm run test:coverage
```

### 测试覆盖范围
- **集成测试**：ECDSA 签名/验证、授权激活、功能权限、节点限制。
- **性能测试**：签名/验证/授权码生成的平均耗时基准。

---

## 🤝 贡献指南

欢迎贡献代码、提出问题或建议。请遵循以下流程：

1. Fork 本仓库。
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)。
3. 提交更改 (`git commit -m 'Add some amazing feature'`)。
4. 推送到分支 (`git push origin feature/amazing-feature`)。
5. 创建 Pull Request。

**代码规范**：
- 使用 ESLint + Prettier（已配置）。
- 所有新功能需包含单元测试。
- 确保构建通过 (`npm run build`) 且无类型错误 (`npm run type-check`)。

---

## 📄 许可证

本项目采用 **MIT License** 开源协议，详情见 [LICENSE](./LICENSE) 文件。

---

## 📞 联系方式

- 项目主页：[GitHub](https://github.com/mytherf/roc-wes)
- 问题反馈：[Issues](https://github.com/mytherf/roc-wes/issues)
- 邮箱：mytherf@163.com

---

**感谢使用 ROC-WES！** 如果觉得有用，请给项目一个 ⭐️ 支持我们。