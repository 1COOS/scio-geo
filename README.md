# Scio Geo

Scio Geo 是面向青少年的互动式世界探索应用。当前版本提供全球195国目录、Natural Earth 国家边界与南极洲大陆底图、3D地球探索、23区域知识体系、国旗与首都挑战、经纬网教学图层、离线国旗和完整地理知识卡。

## 技术栈

- Bun 1.3.13、React 19、TypeScript、Vite
- Three.js、React Three Fiber、Drei、`r3f-globe`
- Tailwind CSS、Radix UI、Motion
- React Router、Zustand、Zod、Dexie、i18next
- Vite PWA / Workbox
- Vitest、Testing Library、Playwright、ESLint、Prettier

## 开发

需要 Bun 1.3.13：

```bash
bun install --registry https://registry.npmjs.org
bun run dev
```

项目只使用 Bun，唯一锁文件为 `bun.lock`。上面的显式 registry 参数用于规避部分本地 npm 镜像缓存的 tarball 完整性异常；如果你的 Bun 已配置官方 registry，可以直接运行 `bun install`。

常用命令：

```bash
bun run dev          # 启动开发服务器
bun run build        # TypeScript + 生产构建
bun run preview      # 预览生产构建
bun run data:generate # 从固定版本数据源重新生成国家数据与国旗
bun run data:validate # 校验195国完整知识卡、来源、边界和本地国旗
bun run lint         # ESLint
bun run typecheck    # TypeScript
bun run format       # 写入格式化
bun run format:check # 检查格式
bun run test         # Vitest
bun run test:e2e     # 生产构建 + Playwright
bun run check        # 完整交付检查
```

首次运行端到端测试前，如果本机没有 Chromium：

```bash
bunx playwright install chromium
```

## 目录

```text
src/
├── app/       应用入口、路由、国际化和 PWA 注册
├── data/      经审核并由 Zod 校验的教育内容
├── features/  探索、任务和游戏逻辑
├── scene/     R3F / Three.js 3D 场景
├── shared/    公共组件与浏览器能力工具
├── storage/   Dexie / IndexedDB 本地持久化
└── test/      单元测试环境
tests/e2e/     Playwright 生产预览测试
```

## 3D 与可访问性基线

- `r3f-globe` 的视角在相机初始化、OrbitControls 变化和重置时同步。
- 平衡画质启用更高 DPR、更多星星和 Bloom；节能画质降低 GPU 开销。
- 系统启用“减少动态效果”时自动关闭自主旋转。
- Canvas 支持鼠标、触控、滚轮和方向键操作，并提供明确的无障碍名称。
- WebGL 不可用时显示文字降级界面，不让页面空白或崩溃。

## 经纬网与初中地理

- 3D 地球保留每 10° 的基础经纬网，2D 定位图保留每 30° 的基础网格。
- “经纬”教学图层同步高亮赤道、南北回归线、南北极圈、0°/180°经线、20°W/160°E东西半球界线和低中高纬分界。
- 统一知识卡覆盖经纬网判读、南北/东西半球、低中高纬和地球五带，并实时判读当前视角中心。
- 特殊参考线和“东西半球”“五带”等知识主题可通过地点搜索进入；内容为仓库内原创中文总结，可完全离线使用。

## 国家知识体系

- `/knowledge` 按亚洲、欧洲、非洲、美洲和大洋洲组织23个学习区域，195国恰好归属一个区域；教材统计口径中的“东南欧”在学习页并入“南欧”。
- 区域页通过2D世界位置图、国旗国家卡、首都揭晓和页内国家详情形成学习路径，并可深链回3D地球继续探索。
- 每个区域提供国旗识国家、国家选国旗、国家选首都三类混合挑战；达到80%即通过，最高成绩与尝试记录只保存在本机IndexedDB中。
- 知识页和挑战按路由懒加载，不增加3D探索页首屏的知识页面代码负担。

## 数据与离线策略

核心内容和图像资源随应用发布，不在运行时依赖第三方国家资料、国旗或纹理服务。国家资料与来源注册表通过 `src/data/countrySchema.ts` 校验，知识区域通过独立Zod契约校验完整覆盖。用户显示偏好和区域挑战进度保存在 IndexedDB；PWA 会缓存生产资源，使安装后的国家搜索、知识学习与挑战可以离线使用。

国家目录固定为193个联合国会员国加梵蒂冈、巴勒斯坦。Natural Earth 1:110m 未提供有效边界的小国使用首都标记辅助选择；所有195国均可搜索。每张知识卡都包含中英文正式国名、完整首都名称、语言、货币、面积、次区域、海陆属性、相邻国家或地区和至少一条带来源的地理亮点。中国、日本、印度、印度尼西亚、埃及、南非、法国、俄罗斯、美国、墨西哥、巴西、澳大利亚保留三条人工策展亮点，其余国家使用固定结构化数据生成一条稳定亮点。

主权国家邻国可以从知识卡直接继续探索；香港、澳门、直布罗陀、法属圭亚那、西撒哈拉和科索沃只以不可点击的“地区”标签呈现，不加入195国目录。知识卡底部可展开查看本地来源注册表，外部链接只作为参考，不是应用运行依赖。

数据来源、固定版本和许可证见 [THIRD_PARTY_DATA.md](./THIRD_PARTY_DATA.md)。当前边界只用于内部产品原型，公开发布前必须重新评估地图合规。

账号、排行榜、积分、徽章和云同步尚未加入。
