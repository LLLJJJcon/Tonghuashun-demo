"""校验 data/materials.json 中每段摘录是否逐字来自原文存档。

用法（项目根目录）：python3 -I scripts/check_excerpts.py
规则：
- 原文去掉换行、回车、分页符后，摘录的每个 segment 必须是其子串；
- 互动易材料（raw_file 形如 xxx.json#indexId）与该问答的 attachedContent 比对；
- table_transcription 的材料额外用「空白折叠为单个空格」的版本比对，仍不通过的列为「需人工核对」；
- 拼接后的摘录（segments 用「……」连接）不得超过 200 字。
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def load_raw(spec: str) -> str:
    if "#" in spec:
        path, index_id = spec.split("#", 1)
        d = json.loads((ROOT / path).read_text(encoding="utf-8"))
        for r in d["company_question_rows"]:
            if r["indexId"] == index_id:
                return r["attachedContent"]
        s = d["search_results_by_indexId"].get(index_id)
        if s:
            return s["attachedContent"]
        raise KeyError(spec)
    return (ROOT / spec).read_text(encoding="utf-8")


def main() -> int:
    mats = json.loads((ROOT / "data/materials.json").read_text(encoding="utf-8"))["materials"]
    bad = 0
    for m in mats:
        raw = load_raw(m["raw_file"])
        joined = re.sub(r"[\n\r\x0c]", "", raw)
        collapsed = re.sub(r"\s+", " ", raw)
        excerpt = "……".join(m["segments"])
        n = len(excerpt)
        status = []
        for i, seg in enumerate(m["segments"]):
            if seg in joined:
                continue
            if m.get("table_transcription") and seg in collapsed:
                status.append(f"seg{i + 1}=表格空白折叠后匹配")
                continue
            status.append(f"seg{i + 1}=未匹配（需人工核对）")
            if not m.get("table_transcription"):
                bad += 1
        if n > 200:
            status.append(f"超过200字（{n}）")
            bad += 1
        print(f"{m['id']}  {n:>3} 字  {'OK' if not status else '；'.join(status)}")
    print(f"\n非表格材料未通过：{bad}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
