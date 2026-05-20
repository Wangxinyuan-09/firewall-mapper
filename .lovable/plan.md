## 目标

把一份防火墙导出配置（如 `SYSCONFIG_1.TXT`，约 3951 行，含 199 条 address、16 个 address-group、247 条 service、288 条 policy、NAT/代理/SSL-offload/server-group 等）解析成结构化模型，并通过一个本地可运行的网站，让安全人员能快速回答你列出的 9 类问题。

## 一、技术形态

- 纯前端 + TanStack Start（已有模板），完全本地运行，不依赖后端数据库。
- 配置文件通过浏览器「上传 / 拖拽」加载，所有解析在浏览器内完成（不上传到任何服务器，满足审计场景的离线要求）。
- 解析结果可一键导出为 JSON，便于二次审计或外部脚本使用。

## 二、配置解析器（核心）

针对 Topsec 风格的行式配置（每行以关键字开头，缩进表示子项），写一个**通用 tokenizer + 分发器**，而不是硬编码字段：

1. 按行扫描，识别「块开头 / 续行 / 注释 `!` / `!config` 段标记」。
2. 维护当前上下文（`authorized-table xxx`、`address xxx`、`policy id N` …）。
3. 每条命令解析成 `{ kind, name, attrs: Record<string, string|string[]>, raw, lineNo }`。
4. 第二遍 pass：把命令归并到领域实体里：
   - **AddressObject** / **AddressGroup**（含 IP / 子网 / 范围 / MAC / 成员引用）
   - **ServiceObject** / **ServiceGroup**（协议 + 端口范围）
   - **Interface / Zone / ISP**
   - **Policy**（源/目的 zone、源/目的地址、服务、动作、日志、命中计数、描述、是否禁用）
   - **NAT 规则**（SNAT/DNAT/双向，原始 ↔ 转换后地址/端口）
   - **ServerGroup / server-exconn-policy / ssl-offload / dns-proxy / divert / cloud-agent**（用于「中间节点」识别：WAF、代理、网关、堡垒机、负载均衡）
   - **User / authorized-table / admin**（堡垒机/管理面入口）
5. 第三遍 pass：建**引用图**
   - 对象 → 被哪些组 / 策略 / NAT 引用（反向索引）
   - 策略 → 展开后的「源地址集合 → 目的地址集合 : 端口集合」三元组
   - 链路：原始源 → (NAT/代理/WAF/LB/堡垒) → 目的，标注每段引用的策略与服务

保留原始行号，所有视图都能「跳回原文」高亮。

## 三、页面与视图

路由（每个独立路由，便于分享与 SEO，虽然是本地工具，但路由独立也利于深链与浏览器历史）：

- `/`  上传配置 + 概览仪表盘（对象数量、策略数量、风险计数、未引用计数）
- `/objects`  地址对象 / 地址组（可筛选：CIDR、是否被引用、命名规范）
- `/services`  服务对象 / 服务组（按端口/协议反查）
- `/policies`  策略表（源/目的/服务/动作/日志/命中/描述/风险标记）
- `/nat`  NAT 表（SNAT/DNAT，原始 ↔ 转换后）
- `/intermediaries`  中间节点视图：WAF / 代理 / 网关 / 堡垒机 / 负载均衡（从 server-group、ssl-offload、divert、cloud-agent 等识别）
- `/access-graph`  「谁能访问谁」交互式查询：选源 → 选目的 → 展开匹配到的策略链 + 端口 + 经过的中间节点（局部链路图，react-flow）
- `/audit`  审计问题清单：未引用对象、any-any 策略、宽松端口（如全 TCP）、缺描述、重复定义、命名混乱（启发式：同 IP 不同名 / 同名不同 IP）、禁用却仍被引用、源地址不一致（业务侧 vs 防火墙看到的 NAT 后地址）
- `/raw`  原始配置查看器（带行号 + 按实体跳转）

每个表格统一支持：列筛选 / 全文搜索 / CSV 导出 / 点击进入详情。

## 四、回答 9 个问题的映射

| # | 问题 | 视图 |
|---|------|------|
| 1 | 有哪些对象 | `/objects` `/services` |
| 2 | 谁引用了这些对象 | 对象详情页「Referenced by」面板 |
| 3 | 谁可以访问谁 | `/access-graph` + `/policies` |
| 4 | 用了什么端口 | 策略详情 / `/services` 反查 |
| 5 | 是否经过中间节点 | `/intermediaries` + access-graph 节点标注 |
| 6 | 业务源 vs 防火墙看到的源 | NAT 详情页对照表；access-graph 显示「原始 → SNAT 后」 |
| 7 | 未被引用对象 | `/audit` 「孤儿对象」分组 |
| 8 | 风险/混乱 | `/audit` 启发式规则集 |
| 9 | 让人快速看懂 | 仪表盘 + 局部链路图 |

## 五、技术细节

- 解析器：`src/lib/parser/` 内拆 tokenizer / context-stack / entity-builders / cross-ref。纯 TS、无外部依赖、覆盖单元测试（vitest）。
- 状态：解析结果存内存 + `localStorage`（可选「记住上次配置」），支持多文件比较（后续扩展）。
- UI：现有 shadcn 组件 + TanStack Table；图用 `reactflow`（按需引入，仅 `/access-graph` 路由懒加载）。
- 风格：审计工具风格（Slate & Steel 调色板，等宽字体用于配置片段），不做花哨动效。
- 隐私：明确在首页声明「文件不会上传」。

## 六、交付里程碑

1. 解析器 + 实体模型 + 单测（先跑通你上传的 `SYSCONFIG_1.TXT`，覆盖率以行计 ≥ 95%）。
2. `/`、`/objects`、`/services`、`/policies` 表格视图。
3. `/nat`、`/intermediaries`、`/audit` 启发式规则。
4. `/access-graph` 交互查询 + 局部链路图。
5. 导出 JSON / CSV、详情页跳回原文。

## 七、需要你确认的点

1. 配置是否只有 Topsec 一种格式，还是后续要支持其它厂商（华为/华三/Hillstone/Fortinet）？当前计划按 Topsec 风格写，但解析器分层后扩展成本低。
2. 「业务理解的原始源地址」是否有外部清单（CMDB/Excel）需要导入比对？还是仅从 NAT 反推。
3. 是否需要多份配置对比（diff）？本期可不做。

确认或调整后即可切到 build 模式开工。
