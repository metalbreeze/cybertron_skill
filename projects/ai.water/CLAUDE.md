# ai.water 项目入口

Cybertron Studio 发明专利撰写/批注答复/申报材料 + 配套 demo 系统项目。本目录不是 git repo。

## 当前阶段

10 篇专利已交付（docx+PDF），10 份研发能力证明已生成（占位信息待用户填），
4 个 demo 仓库已推送 github.com/metalbreeze（PRIVATE）。详版状态与待办见下方存档。

## 硬约束 / 陷阱（改专利前必读）

- 公式**严禁 Unicode 上下标（₁ᵢₕ）与组合帽子（̂）**，一律下划线记法；每个公式后参数逐一解释（含下标）。
- 改稿必须 Word **修订模式**并保留批注；广告两篇 pack 需 `--validate false`（原稿先天校验错）。
- docx/lxml 用 `/Users/shu/.pyenv/versions/3.10.14/bin/python3`；更新文件名带日期后缀。
- 研发能力证明是盖章报国知局的：**占位符（合同编号/人员/经费）不得编造**；仿真材料必须标注"仿真"。
- demo 数据全部 mock，页面已标注"演示数据"，勿当真实数据引用。

## 索引

- **详版状态/待办/决策记录**：`/Users/shu/workspace/xingyu/cybertron_skill/projects/ai.water/status.md`
  （git repo：github.com/metalbreeze/cybertron_skill，换机器先 clone 它）
- 专利与申报材料：`发明专利/`（批注版在 `0701/`，研发能力证明在 `0719/`）
- Demo 源码：`demos/{battery-insight,msgpulse,rootcause-kg,adpilot}`（各自 README 有运行方式）
- 工艺细节 memory：`patent-revision-workflow`（~/.claude 项目记忆）

## 常用命令

```bash
/Users/shu/.pyenv/versions/3.10.14/bin/python3   # docx/lxml/matplotlib 工作专用
/Applications/LibreOffice.app/Contents/MacOS/soffice --headless --convert-to pdf --outdir /tmp/ <docx>
cd demos/<repo>/backend && go run ./cmd/server    # demo 后端；前端 cd frontend && npm run dev
```
