"""生成交给人工的两份清单（本地脚本，不参与构建）。

用法（项目根目录）：python3 -I scripts/make_checklists.py
输出：
- data/labels/labeling-sheet.md：人工标注表（不显示 AI 的性质、立场、同一事件判定）
- data/review-checklist.md：人工校验清单（逐条列出 AI 输出，留填写位置）
"""
import json
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NAT = {"fact": "事实", "opinion": "观点", "speculation": "推测", "rumor": "传闻"}
STA = {"support": "支持", "oppose": "反对", "neutral": "无关"}
DEC = {"new": "新建事件", "same": "并入", "related": "相关但另建/不合并", "unrelated": "无关（噪声）"}

# 标注用主张：从非转载材料的主张中人工挑选 30 条（覆盖四个案例、四种预估性质和三种立场）
LABEL_CLAIMS = [
    "doc_B01_c1", "doc_B01_c2", "doc_B02_c1", "doc_B03_c1", "doc_B03_c2", "doc_B04_c1", "doc_B04_c2", "doc_B05_c1",
    "doc_C01_c1", "doc_C01_c2", "doc_C05_c2", "doc_C02_c1", "doc_C02_c2", "doc_C03_c1", "doc_C03_c2",
    "doc_D01_c1", "doc_D02_c1",
    "doc_A02_c1", "doc_A02_c2", "doc_A02_c3", "doc_A03_c1", "doc_A03_c2", "doc_A04_c1", "doc_A14_c1", "doc_A14_c2",
    "doc_A08_c1", "doc_A08_c2", "doc_A08_c3", "doc_A10_c2", "doc_A11_c2",
]
# 标注用「材料—事件」组合 12 对
LABEL_PAIRS = [
    ("doc_B03", "evt_B"), ("doc_B05", "evt_B"), ("doc_C04", "evt_C"), ("doc_A12", "evt_A"), ("doc_A12", "evt_D"),
    ("doc_D01", "evt_A"), ("doc_D02", "evt_A"), ("doc_D02", "evt_D"), ("doc_A13", "evt_A"), ("doc_A13", "evt_D"),
    ("doc_A10", "evt_A"), ("doc_A03", "evt_A"),
]


def load(p):
    return json.loads((ROOT / p).read_text(encoding="utf-8"))


def esc(s):
    return str(s).replace("|", "｜").replace("\n", " ")


def main():
    mats = {m["id"]: m for m in load("data/materials.json")["materials"]}
    for m in mats.values():
        m["excerpt"] = "……".join(m["segments"])
    srcs = {s["id"]: s for s in load("public/data/sources.json")}
    evs = {e["id"]: e for e in load("public/data/events.json")}
    docs = {d["id"]: d for d in load("public/data/documents.json")}
    claims = {c["id"]: c for c in load("public/data/claims.json")}
    order = sorted(mats.values(), key=lambda m: (datetime.fromisoformat(m["published_at"]), m["id"]))

    def src(mid):
        s = srcs[mats[mid]["source_id"]]
        return f"{s['name']}（{s['tier']} 级）"

    # ---------- 标注表 ----------
    L = ["# 人工标注表（第 5 步）", "",
         "> 生成：AGENT-1，2026-10-13。**请在查看 AI 结果（`public/data/claims.json`、`data/review-checklist.md`）之前完成本表。**",
         "> 本表只给出原文引用和参照的核心主张，**不显示 AI 给出的性质、立场和同一事件判定**。",
         "> 标注结果之后由人整理为 `data/labels/claims_gold.json`、`data/labels/match_gold.json`，再运行评估脚本。", "",
         "## 判定口径（与提示词相同，摘自指导文档 1.5 节）", "",
         "- **性质**：事实（已发生、可核验，通常由信息主体或监管机构正式披露）／观点（有明确署名的评价或预测，含公司对未来的预计）／推测（非官方、基于线索，如「据悉」「接近…人士」「知情人士称」）／传闻（来源不明或匿名，如「网传」）。性质按主张判断，不按整篇材料判断。",
         "- **立场**：针对「参照核心主张」——支持／反对／无关。",
         "- **同一事件**：材料的主要事项与事件核心主张是否为同一件事——是／否／相关但不同（同公司同期、有交叉但不是一件事）。", "",
         "参照核心主张取自人工确认的 `data/cases.md`（按材料所在案例给出，不是 AI 的归属判定）：", ""]
    for e in evs.values():
        L.append(f"- **{e['id']}**：{e['core_proposition']}")
    L += ["", "## 一、主张标注（30 条）", "",
          "| # | 主张 ID | 材料 / 来源 / 披露时间 | 参照核心主张 | 原文引用 | 性质（填） | 立场（填） | 备注（填） |",
          "|---|---|---|---|---|---|---|---|"]
    for i, cid in enumerate(LABEL_CLAIMS, 1):
        c = claims[cid]
        m = mats[c["document_id"]]
        ev = "evt_" + m["case"]
        L.append(f"| {i} | {cid} | {m['id']}《{esc(m['title'])}》／{src(m['id'])}／{m['published_at'][:16].replace('T', ' ')} | {ev} | {esc(c['quote'])} |  |  |  |")
    L += ["", "## 二、同一事件标注（12 对）", "",
          "| # | 材料 | 来源 / 披露时间 | 摘录 | 事件 | 事件核心主张 | 是否同一事件（是／否／相关但不同） | 备注（填） |",
          "|---|---|---|---|---|---|---|---|"]
    for i, (mid, eid) in enumerate(LABEL_PAIRS, 1):
        m = mats[mid]
        L.append(f"| {i} | {mid}《{esc(m['title'])}》 | {src(mid)}／{m['published_at'][:16].replace('T', ' ')} | {esc(m['excerpt'])} | {eid} | {evs[eid]['core_proposition']} |  |  |")
    L += ["", "## 标注记录（填）", "", "- 标注人：", "- 标注日期：", "- 是否在查看 AI 输出之前完成：□ 是　□ 否（如否，请说明）：", ""]
    (ROOT / "data/labels/labeling-sheet.md").write_text("\n".join(L), encoding="utf-8")

    # ---------- 校验清单 ----------
    R = ["# 人工校验清单（第 4 步）", "",
         "> 生成：AGENT-1，2026-10-13。下面逐条列出 AI 预处理的输出（AI-1 转载与股票、AI-2 主张、AI-3 同一事件判定）和对应原文。",
         "> 所有上线记录的 `prep_check.status` 目前都是 `unreviewed`。校验后：确认无误的改为 `passed`；修改的改为 `corrected`，在 `note` 写「原为…改为…，理由…」，在 `original` 保留原值。",
         "> AI 原始返回见 `data/ai_runs_raw/<run_id>.json`。模型：claude-opus-5-5（Claude Code 子 agent 按提示词执行），提示词版本均为 v1.0。",
         "> 「未入库」表示 AI-2 抽出了该主张，但它针对的事件与材料的归属事件不同（或材料被判为无关），按规则未写入 `claims.json`，请一并确认这样处理是否合适。", "",
         "材料按披露时间排序。每条后面的「校验」一行请勾选并填写。", ""]
    for m in order:
        mid = m["id"]
        d = docs[mid]
        a1 = load(f"data/ai_runs_raw/run_ai1_{mid[4:]}.json")
        a2 = load(f"data/ai_runs_raw/run_ai2_{mid[4:]}.json")
        a3 = load(f"data/ai_runs_raw/run_ai3_{mid[4:]}.json")
        p1, p2, p3 = a1["parsed_output"], a2["parsed_output"], a3["parsed_output"]
        R += [f"## {mid}《{m['title']}》", "",
              f"- 来源：{src(mid)}；披露时间 {m['published_at']}；模拟抓取时间 {d['fetched_at']}；来源修订 {m['source_updated_at'] or '无'}",
              f"- 链接：{m['url']}",
              f"- 摘录：{m['excerpt']}", "",
              f"**AI-1（{a1['id']}）** 转载：{'是，转载自 ' + p1['repost_of'] if p1['is_repost'] else '否'}；股票：{'、'.join(p1['stocks'])}；置信度 {p1['confidence']}",
              f"- 理由：{p1['reason']}",
              "- 校验：□ 通过　□ 修正为＿＿＿＿，理由＿＿＿＿", "",
              f"**AI-3（{a3['id']}）** 判定：{DEC[p3['decision']]}；事件：{p3['event_id'] or '无'}；候选：{'、'.join(p3['candidate_event_ids']) or '无'}；置信度 {p3['confidence']}",
              f"- 理由：{p3['reason']}",
              "- 校验：□ 通过　□ 修正为＿＿＿＿，理由＿＿＿＿", "",
              f"**AI-2（{a2['id']}）** 共 {len(p2['claims'])} 条主张：", ""]
        for i, c in enumerate(p2["claims"], 1):
            cid = f"{mid}_c{i}"
            stored = cid in claims
            rev = f"{'更新' if c['revision']['type'] == 'update' else '更正'} → {'、'.join(c['revision']['targets'])}" if c.get("revision") else "无"
            flds = "；".join(f"{k} = {v['value']}（{v['display']}）" for k, v in (c.get("fields") or {}).items()) or "无"
            occ = c["occurred_at"] or "无"
            if c.get("occurred_range"):
                occ += f"（区间 {c['occurred_range'][0]} ~ {c['occurred_range'][1]}）"
            R += [f"- **{cid}**{'' if stored else '（未入库）'}：{c['text']}",
                  f"  - 原文引用：「{c['quote']}」",
                  f"  - 针对事件：{c.get('event_ref') or '无'}｜性质：{NAT[c['nature']]}｜立场：{STA[c['stance']]}｜修订：{rev}",
                  f"  - 要素：{flds}",
                  f"  - 发生时间：{occ}，精度 {c['occurred_precision']}｜有效期：{c['valid_until'] or '无'}",
                  f"  - 置信度 {c['confidence']}｜理由：{c['reason']}",
                  "  - 校验：□ 通过　□ 修正为＿＿＿＿，理由＿＿＿＿"]
        R.append("")
    (ROOT / "data/review-checklist.md").write_text("\n".join(R), encoding="utf-8")
    print("ok")


if __name__ == "__main__":
    main()
