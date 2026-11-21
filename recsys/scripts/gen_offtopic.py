#!/usr/bin/env python3
"""Search queries from fields CHI does not cover, for the "few matches" check (GPU node).

The relevance check (does CHI cover this topic at all?) needs examples of topics it does
not cover. A local LLM writes short queries a researcher in a clearly non-HCI field
would type; scripts/train_relevance.py learns the check from them and the held-out CHI
queries. Fields are split in two so the check is tested on fields it never saw.

Output: data/processed/offtopic_queries.json  [{"field": ..., "query": ...}, ...]
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import config  # noqa: E402

GEN_MODEL = os.environ.get("CHI_GEN_MODEL", "Qwen/Qwen2.5-7B-Instruct")
FIELDS = ["volcanology", "marine biology", "organic chemistry", "particle physics", "astronomy",
          "constitutional law", "corporate finance", "macroeconomics", "veterinary medicine",
          "agronomy", "structural civil engineering", "metallurgy", "ornithology", "paleontology",
          "ancient history", "music theory", "culinary arts", "exercise physiology", "oceanography",
          "climatology", "molecular genetics", "pharmacology", "nuclear engineering",
          "petroleum engineering", "accounting", "theology", "historical linguistics", "botany",
          "entomology", "hydrology", "soil science", "tax law", "condensed matter physics",
          "immunology", "forestry", "mining engineering", "archaeology", "fisheries science",
          "materials chemistry", "plant pathology"]
PROMPT = """You are a researcher in {field}. Write 25 different short search queries (2-7 words) you would type into a paper search engine about topics in {field}. Vary the wording: some very short (2-3 words), some longer. No questions, no quotes.

Return only JSON: {{"queries": ["...", "..."]}}"""


def main():
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer
    os.environ.setdefault("HF_HOME", config.HF_CACHE)
    tok = AutoTokenizer.from_pretrained(GEN_MODEL, padding_side="left")
    model = AutoModelForCausalLM.from_pretrained(GEN_MODEL, dtype=torch.bfloat16, device_map="cuda")
    texts = [tok.apply_chat_template([{"role": "user", "content": PROMPT.format(field=f)}],
                                     tokenize=False, add_generation_prompt=True) for f in FIELDS]
    out = []
    for b in range(0, len(texts), 20):
        enc = tok(texts[b:b + 20], return_tensors="pt", padding=True).to("cuda")
        with torch.no_grad():
            gen = model.generate(**enc, max_new_tokens=500, do_sample=False, pad_token_id=tok.eos_token_id)
        for f, t in zip(FIELDS[b:b + 20], tok.batch_decode(gen[:, enc["input_ids"].shape[1]:], skip_special_tokens=True)):
            m = re.search(r"\{.*\}", t, re.S)
            try:
                qs = json.loads(m.group(0))["queries"] if m else []
            except (json.JSONDecodeError, KeyError):
                qs = []
            out += [{"field": f, "query": q.strip()} for q in qs if isinstance(q, str) and q.strip()]
        print(len(out), flush=True)
    path = os.path.join(config.ROOT, "data", "processed", "offtopic_queries.json")
    json.dump(out, open(path, "w"), indent=0)
    print("saved", len(out), "to", path)


if __name__ == "__main__":
    main()
