"""AI 预处理的输入构造与结果保存（本地脚本，不参与构建，不调用任何外部 API）。

本批次的「模型」是 Claude Code 子 agent 本身：脚本按提示词模板拼出输入，
子 agent 阅读输入后写出 JSON 输出，再由脚本校验并保存原始返回。

用法（项目根目录）：
  python3 -I scripts/preprocess.py input <ai1|ai2|ai3> <doc_id>
      打印该阶段的用户消息（按 prompts/ 中的模板），并写入 scratch 缓存
  python3 -I scripts/preprocess.py save <ai1|ai2|ai3> <doc_id> <output_file>
      校验输出 JSON；合法则写入 data/ai_runs_raw/<run_id>.json（status ok / retried_ok）；
      不合法则记录一次失败尝试（attempts+1），超过 3 次标记 invalid_output
  python3 -I scripts/preprocess.py order
      打印按披露时间排序的处理顺序
"""
import json
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data/ai_runs_raw"
CST = timezone(timedelta(hours=8))
MODEL = "claude-opus-5-5（Claude Code 子 agent 按提示词执行）"
PROMPTS = {
    "ai1": ("AI-1", "prompts/ai1-document.md", "v1.0"),
    "ai2": ("AI-2", "prompts/ai2-claims.md", "v1.0"),
    "ai3": ("AI-3", "prompts/ai3-event-match.md", "v1.0"),
}
NATURES = {"fact", "opinion", "speculation", "rumor"}
STANCES = {"support", "oppose", "neutral"}
PRECISIONS = {"datetime", "day", "month", "quarter", "range", "unknown"}
DECISIONS = {"new", "same", "related", "unrelated"}
ISO_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?\+08:00$")


def load_json(p: Path):
    return json.loads(p.read_text(encoding="utf-8"))


def materials():
    mats = load_json(ROOT / "data/materials.json")["materials"]
    for m in mats:
        m["excerpt"] = "……".join(m["segments"])
    return mats


def ts(s: str) -> datetime:
    return datetime.fromisoformat(s)


def ordered(mats):
    return sorted(mats, key=lambda m: (ts(m["published_at"]), m["id"]))


def sources():
    return {s["id"]: s for s in load_json(ROOT / "public/data/sources.json")}


def events():
    return load_json(ROOT / "public/data/events.json")


def run_path(stage: str, doc_id: str) -> Path:
    return RAW_DIR / f"run_{stage}_{doc_id.removeprefix('doc_')}.json"


def parsed(stage: str, doc_id: str):
    p = run_path(stage, doc_id)
    if not p.exists():
        return None
    r = load_json(p)
    return r["parsed_output"] if r["status"] in ("ok", "retried_ok") else None


def doc_line(m, srcs):
    s = srcs[m["source_id"]]
    return f"- {m['id']}｜{s['name']}｜{m['published_at']}｜{m['title']}｜{m['excerpt']}"


def candidates(m, mats):
    """同一股票（以 AI-1 输出为准）、前后 30 天内有其他材料的事件。"""
    ai1 = parsed("ai1", m["id"])
    if ai1 is None:
        raise SystemExit(f"{m['id']} 尚无合法的 AI-1 输出")
    stocks = set(ai1["stocks"])
    out = []
    for e in events():
        if not stocks & {s["code"] for s in e["stocks"]}:
            continue
        letter = e["id"].removeprefix("evt_")
        near = [x for x in mats if x["id"] != m["id"] and x["case"] == letter
                and abs((ts(x["published_at"]) - ts(m["published_at"])).total_seconds()) <= 30 * 86400]
        if near:
            out.append(e)
    return out


def assigned_before(m, mats, event_id):
    """披露时间早于本材料、并已由 AI-3 判定归属 event_id 的材料。"""
    out = []
    for x in ordered(mats):
        if (ts(x["published_at"]), x["id"]) >= (ts(m["published_at"]), m["id"]):
            break
        r = parsed("ai3", x["id"])
        if r and r["event_id"] == event_id:
            out.append(x)
    return out


def claim_ids(doc_id, ai2):
    return [f"{doc_id}_c{i + 1}" for i in range(len(ai2["claims"]))]


def build_input(stage, m, mats):
    srcs = sources()
    s = srcs[m["source_id"]]
    head = (f"材料 ID：{m['id']}\n标题：{m['title']}\n来源：{s['name']}（{s['tier']} 级，{s['type']}）\n"
            f"披露时间：{m['published_at']}\n摘录：{m['excerpt']}\n")
    if stage == "ai1":
        stock_hint = {"A": "600392", "D": "600392", "B": "688069", "C": "301468"}
        prior = []
        for x in ordered(mats):
            if x["id"] == m["id"]:
                break
            same_stock = stock_hint[x["case"]] == stock_hint[m["case"]]
            dt = (ts(m["published_at"]) - ts(x["published_at"])).total_seconds()
            if same_stock and 0 <= dt <= 7 * 86400:
                prior.append(doc_line(x, srcs))
        msg = "【待分析材料】\n" + head + "\n【同一股票前后 7 天内已有材料】（可能为空）\n" + ("\n".join(prior) or "（无）")
        summary = f"材料 {m['id']}；7 天内已有材料 {len(prior)} 条：" + "、".join(p.split('｜')[0][2:] for p in prior)
        return msg, summary
    cands = candidates(m, mats)
    if stage == "ai2":
        parts = []
        for e in cands:
            fields = ", ".join(f"{f['key']}: {f['label']}" for f in e["fields"])
            lines = [f"- {e['id']}｜核心主张：{e['core_proposition']}｜要素定义：{{{fields}}}", "  已有主张（披露时间早于本材料）："]
            n = 0
            for x in assigned_before(m, mats, e["id"]):
                ai2 = parsed("ai2", x["id"])
                if not ai2:
                    continue
                for cid, c in zip(claim_ids(x["id"], ai2), ai2["claims"]):
                    if c.get("event_ref") != e["id"]:
                        continue
                    fv = json.dumps(c.get("fields", {}), ensure_ascii=False) if c.get("fields") else "无要素"
                    lines.append(f"  - {cid}｜{c['nature']}｜{c['stance']}｜{fv}｜{c['quote']}")
                    n += 1
            if not n:
                lines.append("  （无）")
            parts.append("\n".join(lines))
        msg = "【待分析材料】\n" + head + "\n【候选事件】（同一股票、前后 30 天内；可能为空）\n" + ("\n".join(parts) or "（无）")
        summary = f"材料 {m['id']}；候选事件 {[e['id'] for e in cands]}"
        return msg, summary
    # ai3
    ai2 = parsed("ai2", m["id"])
    if ai2 is None:
        raise SystemExit(f"{m['id']} 尚无合法的 AI-2 输出")
    cl = "\n".join(f"- c{i + 1}｜{c['nature']}｜{c['stance']}（针对 {c.get('event_ref')}）｜{c['quote']}"
                   for i, c in enumerate(ai2["claims"])) or "（无）"
    parts = []
    for e in cands:
        prior = assigned_before(m, mats, e["id"])
        lines = [f"- {e['id']}｜{e['title']}｜核心主张：{e['core_proposition']}", "  已归属材料摘要："]
        lines += [f"  - {x['id']}｜{x['published_at']}｜{x['title']}" for x in prior] or ["  （无，该事件尚无已归属材料）"]
        parts.append("\n".join(lines))
    head3 = (f"材料 ID：{m['id']}\n标题：{m['title']}\n来源：{s['name']}（{s['tier']} 级）\n"
             f"披露时间：{m['published_at']}\n摘录：{m['excerpt']}\n")
    msg = "【新材料】\n" + head3 + "AI-2 主张：\n" + cl + "\n\n【候选事件】\n" + ("\n".join(parts) or "（无）")
    summary = f"材料 {m['id']}；AI-2 主张 {len(ai2['claims'])} 条；候选事件 {[e['id'] for e in cands]}"
    return msg, summary


def iso_ok(v):
    return isinstance(v, str) and bool(ISO_RE.match(v))


def validate(stage, m, out, mats):
    errs = []
    num = lambda v: isinstance(v, (int, float)) and not isinstance(v, bool) and 0 <= v <= 1
    if not isinstance(out, dict):
        return ["输出不是 JSON 对象"]
    if stage == "ai1":
        if not isinstance(out.get("is_repost"), bool): errs.append("is_repost")
        ro = out.get("repost_of")
        ids = {x["id"] for x in mats}
        if out.get("is_repost") and ro not in ids: errs.append("repost_of 不是已有材料")
        if not out.get("is_repost") and ro is not None: errs.append("repost_of 应为 null")
        if not (isinstance(out.get("stocks"), list) and all(re.match(r"^\d{6}\.(SH|SZ)$", x) for x in out["stocks"])): errs.append("stocks")
        if not num(out.get("confidence")): errs.append("confidence")
        if not isinstance(out.get("reason"), str): errs.append("reason")
    elif stage == "ai2":
        cands = {e["id"]: e for e in candidates(m, mats)}
        known_claims = set()
        for e in cands:
            for x in assigned_before(m, mats, e):
                a = parsed("ai2", x["id"])
                if a: known_claims |= set(claim_ids(x["id"], a))
        cl = out.get("claims")
        if not isinstance(cl, list): return ["claims 不是数组"]
        for i, c in enumerate(cl):
            p = f"claims[{i}]"
            if not isinstance(c.get("text"), str): errs.append(f"{p}.text")
            if not (isinstance(c.get("quote"), str) and c["quote"] and c["quote"] in m["excerpt"]): errs.append(f"{p}.quote 不是摘录子串")
            if c.get("event_ref") is not None and c["event_ref"] not in cands: errs.append(f"{p}.event_ref 不在候选事件中")
            if c.get("nature") not in NATURES: errs.append(f"{p}.nature")
            if c.get("stance") not in STANCES: errs.append(f"{p}.stance")
            rv = c.get("revision")
            if rv is not None:
                if not (isinstance(rv, dict) and rv.get("type") in ("update", "correct") and isinstance(rv.get("targets"), list) and rv["targets"]):
                    errs.append(f"{p}.revision")
                elif any(t not in known_claims for t in rv["targets"]):
                    errs.append(f"{p}.revision.targets 引用了未给出的主张")
            fl = c.get("fields")
            if fl is not None:
                ev = cands.get(c.get("event_ref"))
                allowed = {f["key"] for f in ev["fields"]} if ev else set()
                for k, v in fl.items():
                    if k not in allowed: errs.append(f"{p}.fields.{k} 未定义")
                    if not (isinstance(v, dict) and isinstance(v.get("value"), (int, float, str)) and isinstance(v.get("display"), str)): errs.append(f"{p}.fields.{k} 格式")
            if not (c.get("occurred_at") is None or iso_ok(c["occurred_at"])): errs.append(f"{p}.occurred_at")
            if c.get("occurred_precision") not in PRECISIONS: errs.append(f"{p}.occurred_precision")
            if c.get("occurred_precision") == "range":
                rg = c.get("occurred_range")
                if not (isinstance(rg, list) and len(rg) == 2 and all(iso_ok(x) for x in rg)): errs.append(f"{p}.occurred_range")
            if not (c.get("valid_until") is None or iso_ok(c["valid_until"])): errs.append(f"{p}.valid_until")
            if c.get("nature") == "opinion" and c.get("valid_until") is None and c.get("stance") != "neutral":
                print(f"提示：{p} 为观点但未填 valid_until（若是预期类主张则违反提示词要求）")
            if not num(c.get("confidence")): errs.append(f"{p}.confidence")
            if not isinstance(c.get("reason"), str): errs.append(f"{p}.reason")
    else:
        cands = [e["id"] for e in candidates(m, mats)]
        d = out.get("decision")
        if d not in DECISIONS: errs.append("decision")
        if d == "unrelated" and out.get("event_id") is not None: errs.append("unrelated 时 event_id 应为 null")
        if d in ("same", "related") and out.get("event_id") not in cands: errs.append("event_id 不在候选事件中")
        if d == "new" and out.get("event_id") is not None and out["event_id"] not in cands: errs.append("event_id 不在候选事件中")
        if not isinstance(out.get("candidate_event_ids"), list) or any(x not in cands for x in out["candidate_event_ids"]): errs.append("candidate_event_ids")
        if not num(out.get("confidence")): errs.append("confidence")
        if not isinstance(out.get("reason"), str): errs.append("reason")
    return errs


def main():
    cmd = sys.argv[1]
    mats = materials()
    if cmd == "order":
        for m in ordered(mats):
            print(m["published_at"], m["id"], m["title"][:40])
        return
    stage, doc_id = sys.argv[2], sys.argv[3]
    m = next(x for x in mats if x["id"] == doc_id)
    msg, summary = build_input(stage, m, mats)
    if cmd == "input":
        print(msg)
        return
    if cmd == "save":
        raw_text = Path(sys.argv[4]).read_text(encoding="utf-8")
        p = run_path(stage, doc_id)
        rec = load_json(p) if p.exists() else None
        if rec and rec["status"] in ("ok", "retried_ok"):
            raise SystemExit(f"{p.name} 已有合法输出，不覆盖")
        st, pf, pv = PROMPTS[stage]
        now = datetime.now(CST).isoformat(timespec="seconds")
        if rec is None:
            rec = {"id": p.stem, "stage": st, "document_id": doc_id, "model": MODEL, "prompt_file": pf,
                   "prompt_version": pv, "run_at": now, "status": "failed", "attempts": 0,
                   "input_summary": summary, "input_message": msg, "attempt_log": [], "parsed_output": None}
        try:
            out = json.loads(raw_text)
            errs = validate(stage, m, out, mats)
        except json.JSONDecodeError as e:
            out, errs = None, [f"JSON 解析失败：{e}"]
        rec["attempts"] += 1
        rec["attempt_log"].append({"attempt": rec["attempts"], "at": now, "raw_output": raw_text, "validation_errors": errs})
        rec["run_at"] = now
        if errs:
            rec["status"] = "invalid_output" if rec["attempts"] >= 3 else "failed"
            rec["error"] = "；".join(errs)
            print("校验未通过：", errs)
        else:
            rec["status"] = "ok" if rec["attempts"] == 1 else "retried_ok"
            rec["parsed_output"] = out
            rec.pop("error", None)
            print(f"已保存 {p.name}（{rec['status']}，attempts={rec['attempts']}）")
        RAW_DIR.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(rec, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
