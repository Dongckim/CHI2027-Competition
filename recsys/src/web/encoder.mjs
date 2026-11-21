// Query encoders for the phone. "static" needs no model runtime at all: one int8
// vector per WordPiece token, averaged, then one small matrix (the head) maps it into
// the paper-vector space. "onnx" runs the transformer student with onnxruntime-web.
import { normalize } from "./py.mjs";

/** cfg: encoder.json; tok: a @huggingface/tokenizers Tokenizer;
 * tokens: {data: Int8Array, shape: [V, d0]}, scales: Float32Array [V], head: {data, shape: [d0, d]} */
export function staticEncoder(cfg, tok, tokens, scales, head) {
  const [, d0] = tokens.shape;
  const [, d] = head.shape;
  return async function embed(text) {
    let ids = tok.encode(text, { add_special_tokens: false }).ids;
    ids = ids.slice(0, cfg.max_len);
    const mean = new Float64Array(d0);
    for (const t of ids) {
      const s = scales[t], o = t * d0;
      for (let k = 0; k < d0; k++) mean[k] += Math.fround(tokens.data[o + k] * s);
    }
    const out = new Float32Array(d);
    if (!ids.length) return out;
    for (let k = 0; k < d0; k++) mean[k] /= ids.length;
    for (let k = 0; k < d0; k++) {
      const m = mean[k], o = k * d;
      if (!m) continue;
      for (let j = 0; j < d; j++) out[j] += m * head.data[o + j];
    }
    return normalize(out);
  };
}

/** The transformer student (model_int8.onnx); ort is the onnxruntime-web module. */
export async function onnxEncoder(cfg, tok, ort, modelBytes) {
  const sess = await ort.InferenceSession.create(modelBytes);
  return async function embed(text) {
    let ids = tok.encode(cfg.query_prefix + text).ids;
    if (ids.length > cfg.max_len) ids = [...ids.slice(0, cfg.max_len - 1), ids[ids.length - 1]];
    const n = ids.length;
    const out = await sess.run({
      input_ids: new ort.Tensor("int64", BigInt64Array.from(ids, BigInt), [1, n]),
      attention_mask: new ort.Tensor("int64", new BigInt64Array(n).fill(1n), [1, n]),
    });
    return Float32Array.from(out.embedding.data);
  };
}
