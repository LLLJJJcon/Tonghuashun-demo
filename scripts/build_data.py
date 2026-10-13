"""由材料录入文件和 AI 原始返回生成上线数据 D2、D3、D4（本地脚本，不参与构建）。

用法（项目根目录）：python3 -I scripts/build_data.py
输入：data/materials.json、public/data/sources.json、public/data/events.json、data/ai_runs_raw/*.json
输出：public/data/documents.json、public/data/claims.json、public/data/ai_runs.json

规则：
- 模拟抓取时间（固定规则，不随机）：S/A 级 = 披露时间 + 10 分钟；B/C 级 = + 30 分钟；D 级 = + 2 小时；
  转载材料若按等级算出的时间不晚于被转载材料的抓取时间，则取被转载材料抓取时间 + 5 分钟。
- repost_of、stocks 取 AI-1 输出；match 取 AI-3 输出；主张取 AI-2 输出中 event_ref 等于材料归属事件的那些，
  主张 ID 按 AI-2 输出顺序编号（未入库的主张会留下编号空缺，见 data/review-checklist.md）。
- 所有 prep_check.status 一律为 unreviewed（人工校验由人完成）。
"""
import json
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DELAY = {"S": timedelta(minutes=10), "A": timedelta(minutes=10), "B": timedelta(minutes=30),
         "C": timedelta(minutes=30), "D": timedelta(hours=2)}


def load(p):
    return json.loads((ROOT / p).read_text(encoding="utf-8"))


def run(stage, doc_id):
    r = load(f"data/ai_runs_raw/run_{stage}_{doc_id.removeprefix('doc_')}.json")
    assert r["status"] in ("ok", "retried_ok"), r["id"]
    return r


def iso(dt: datetime) -> str:
    return dt.isoformat(timespec="seconds")


def main():
    mats = load("data/materials.json")["materials"]
    srcs = {s["id"]: s for s in load("public/data/sources.json")}
    mats.sort(key=lambda m: (datetime.fromisoformat(m["published_at"]), m["id"]))
    fetched = {}
    docs, claims, runs = [], [], []
    for m in mats:
        a1 = run("ai1", m["id"])["parsed_output"]
        a2 = run("ai2", m["id"])["parsed_output"]
        a3r = run("ai3", m["id"])
        a3 = a3r["parsed_output"]
        pub = datetime.fromisoformat(m["published_at"])
        f = pub + DELAY[srcs[m["source_id"]]["tier"]]
        if a1["repost_of"]:
            orig = fetched[a1["repost_of"]]
            if f <= orig:
                f = orig + timedelta(minutes=5)
        fetched[m["id"]] = f
        doc = {
            "id": m["id"], "source_id": m["source_id"], "title": m["title"], "url": m["url"],
            "excerpt": "……".join(m["segments"]), "data_origin": m["data_origin"],
            "published_at": m["published_at"], "fetched_at": iso(f), "fetched_at_simulated": True,
            "source_updated_at": m["source_updated_at"], "repost_of": a1["repost_of"], "stocks": a1["stocks"],
            "match": {
                "decision": a3["decision"], "event_id": a3["event_id"],
                "candidate_event_ids": a3["candidate_event_ids"],
                "ai": {"run_id": a3r["id"], "confidence": a3["confidence"], "reason": a3["reason"]},
                "prep_check": {"status": "unreviewed"},
            },
        }
        docs.append(doc)
        if a3["decision"] != "unrelated":
            for i, c in enumerate(a2["claims"]):
                if c.get("event_ref") != a3["event_id"]:
                    continue
                cl = {"id": f"{m['id']}_c{i + 1}", "document_id": m["id"], "event_id": a3["event_id"],
                      "text": c["text"], "quote": c["quote"], "nature": c["nature"], "stance": c["stance"]}
                if c.get("revision"):
                    cl["revision"] = c["revision"]
                if c.get("fields"):
                    cl["fields"] = c["fields"]
                cl["occurred_at"] = c["occurred_at"]
                cl["occurred_precision"] = c["occurred_precision"]
                if c.get("occurred_range"):
                    cl["occurred_range"] = c["occurred_range"]
                cl["valid_until"] = c["valid_until"]
                cl["ai"] = {"run_id": f"run_ai2_{m['id'].removeprefix('doc_')}", "confidence": c["confidence"], "reason": c["reason"]}
                cl["prep_check"] = {"status": "unreviewed"}
                claims.append(cl)
    ids = {c["id"] for c in claims}
    for c in claims:
        if "revision" in c:
            missing = [t for t in c["revision"]["targets"] if t not in ids]
            assert not missing, (c["id"], missing)
    for m in mats:
        for st in ("ai1", "ai2", "ai3"):
            r = run(st, m["id"])
            last = r["attempt_log"][-1]["raw_output"]
            rec = {"id": r["id"], "stage": r["stage"], "document_id": r["document_id"], "model": r["model"],
                   "prompt_file": r["prompt_file"], "prompt_version": r["prompt_version"], "run_at": r["run_at"],
                   "status": r["status"], "attempts": r["attempts"], "output_excerpt": last[:500]}
            if r.get("error"):
                rec["error"] = r["error"]
            runs.append(rec)
    out = ROOT / "public/data"
    for name, data in (("documents.json", docs), ("claims.json", claims), ("ai_runs.json", runs)):
        (out / name).write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"documents {len(docs)}，claims {len(claims)}，ai_runs {len(runs)}")


if __name__ == "__main__":
    main()
