#!/usr/bin/env python3
"""Short names for the topic clusters (GPU node). Reads data/processed/clusters.json,
asks the local LLM for a 2-4 word name and one plain sentence per cluster from its
keywords and the titles closest to its centre, and writes them back (label_source
"llm"). Greedy decoding, so the names do not change between runs.

  sbatch scripts/name_clusters.slurm
  sbatch scripts/name_clusters.slurm --sub    # the sub-topics (build_subclusters.py)
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import config  # noqa: E402

GEN_MODEL = os.environ.get("CHI_GEN_MODEL", "Qwen/Qwen2.5-7B-Instruct")
PATH = os.path.join(config.ROOT, "data", "processed", "clusters.json")
PROMPT = """These CHI conference talks were grouped together by meaning.

Distinctive keywords: {kws}

Talks closest to the centre of the group:
{titles}

Give the group a short topic name a conference attendee would understand at a glance
(2-4 words, Title Case, no "HCI", no "Research", no colon), and one plain sentence
(max 18 words) saying what the talks in it are about.

Return only JSON: {{"label": "...", "description": "..."}}"""
SUB_PROMPT = """These CHI conference talks are one sub-group inside the topic "{parent}".
The other sub-groups of "{parent}" are about: {siblings}.

Keywords that set this sub-group apart: {kws}

Talks closest to its centre:
{titles}

Name this sub-group so it is clearly different from "{parent}" and from the others
(2-4 words, Title Case, no "HCI", no "Research", no colon), and write one plain sentence
(max 18 words) saying what its talks are about.

Return only JSON: {{"label": "...", "description": "..."}}"""


def main():
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer

    os.environ.setdefault("HF_HOME", config.HF_CACHE)
    data = json.load(open(PATH, encoding="utf-8"))
    items = {it["id"]: it for it in json.load(open(os.path.join(config.ROOT, "data", "processed",
                                                                 "program.json")))}
    tok = AutoTokenizer.from_pretrained(GEN_MODEL, padding_side="left")
    model = AutoModelForCausalLM.from_pretrained(GEN_MODEL, torch_dtype=torch.bfloat16, device_map="cuda")
    model.eval()
    sub = "--sub" in sys.argv
    groups, prompts = [], []
    for c in data["clusters"]:
        if sub:
            for x in c["subclusters"]:
                sib = "; ".join(", ".join(k["keyword"] for k in y["keywords"][:3])
                                for y in c["subclusters"] if y is not x)
                groups.append((x, {c["label"].lower()}))
                prompts.append(SUB_PROMPT.format(parent=c["label"], siblings=sib,
                                                 kws=", ".join(k["keyword"] for k in x["keywords"]),
                                                 titles="\n".join(f"- {items[i]['title']}" for i in x["items"][:8])))
        else:
            groups.append((c, set()))
            prompts.append(PROMPT.format(kws=", ".join(k["keyword"] for k in c["keywords"]),
                                         titles="\n".join(f"- {items[i]['title']}" for i in c["items"][:10])))
    prompts = [tok.apply_chat_template([{"role": "user", "content": p}], tokenize=False,
                                       add_generation_prompt=True) for p in prompts]
    texts = []
    for b in range(0, len(prompts), 32):
        enc = tok(prompts[b:b + 32], return_tensors="pt", padding=True).to("cuda")
        with torch.no_grad():
            out = model.generate(**enc, max_new_tokens=80, do_sample=False, pad_token_id=tok.eos_token_id)
        texts += tok.batch_decode(out[:, enc["input_ids"].shape[1]:], skip_special_tokens=True)
    used = set()
    for (c, taken), t in zip(groups, texts):
        m = re.search(r"\{.*\}", t, re.S)
        try:
            obj = json.loads(m.group(0)) if m else {}
        except json.JSONDecodeError:
            obj = {}
        label = str(obj.get("label", "")).strip()
        if label and 1 <= len(label.split()) <= 5 and label.lower() not in used | taken:
            c["keyword_label"] = c["label"]
            c["label"], c["label_source"] = label, "llm"
            used.add(label.lower())
        c["description"] = str(obj.get("description", "")).strip() or None
        print(f"{c['id']} {c['size']:>4} {c['label']:<36} | {c['description']}", flush=True)
    json.dump(data, open(PATH, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("wrote", PATH)


if __name__ == "__main__":
    main()
