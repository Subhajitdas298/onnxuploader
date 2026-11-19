"""Generates the small ONNX models the backend tests use to cover unusual model shapes.

Usage: python generate_fixtures.py     (needs: pip install onnx onnxruntime numpy)
"""
import pathlib

import numpy as np
import onnx
import onnxruntime as ort
from onnx import TensorProto as T, helper as h

HERE = pathlib.Path(__file__).parent


def c(name, value, dtype=T.FLOAT):
    return h.make_tensor(name, dtype, [], [value])


def save(name, inputs, outputs, nodes, inits=(), ml=False):
    graph = h.make_graph(nodes, name, inputs, outputs, initializer=list(inits))
    opsets = [h.make_opsetid("", 17)] + ([h.make_opsetid("ai.onnx.ml", 2)] if ml else [])
    model = h.make_model(graph, opset_imports=opsets, producer_name="fraud-runner-test-fixtures")
    model.ir_version = 9
    onnx.checker.check_model(model)
    onnx.save(model, HERE / f"{name}.onnx")
    return HERE / f"{name}.onnx"


def vi(name, dtype, shape):
    return h.make_tensor_value_info(name, dtype, shape)


def run(path, feeds):
    return ort.InferenceSession(str(path)).run(None, feeds)


def encoder(inp, out, mapping):
    return h.make_node("LabelEncoder", [inp], [out], domain="ai.onnx.ml", keys_strings=list(mapping),
                       values_floats=[float(v) for v in mapping.values()], default_float=0.0)


# --- all ten features, in a shuffled order, mixed int32/int64, additive so Shapley values are exact -----------------
def all_features():
    inputs = [
        vi("channel", T.STRING, [1, 1]), vi("currency", T.STRING, [1, 1]), vi("country_code", T.STRING, [1, 1]),
        vi("txn_count_24h", T.INT32, [1, 1]), vi("merchant_category_code", T.INT64, [1, 1]),
        vi("account_age_days", T.INT64, [1, 1]), vi("amount_cents", T.INT64, [1, 1]),
        vi("is_card_present", T.BOOL, [1, 1]), vi("is_new_device", T.BOOL, [1, 1]), vi("is_international", T.BOOL, [1, 1]),
    ]
    weights = {"txn_count_24h": 0.01, "merchant_category_code": 0.00001, "account_age_days": 0.0001,
               "amount_cents": 0.00001, "is_card_present": -0.05, "is_new_device": 0.1, "is_international": 0.2}
    nodes, inits, terms = [], [], []
    for name, w in weights.items():
        nodes += [h.make_node("Cast", [name], [f"{name}_f"], to=T.FLOAT),
                  h.make_node("Mul", [f"{name}_f", f"w_{name}"], [f"{name}_t"])]
        inits.append(c(f"w_{name}", w))
        terms.append(f"{name}_t")
    nodes += [encoder("channel", "channel_t", {"ATM": 0.1, "MOBILE": 0.05}),
              encoder("currency", "currency_t", {"BTC": 0.3}),
              encoder("country_code", "country_code_t", {"NG": 0.25, "RU": 0.25})]
    terms += ["channel_t", "currency_t", "country_code_t"]
    nodes.append(h.make_node("Sum", terms, ["risk_score"]))
    return save("all_features", inputs, [vi("risk_score", T.FLOAT, [1, 1])], nodes, inits, ml=True)


def simple(name, inputs, out, nodes, inits=(), ml=False):
    return save(name, inputs, [out], nodes, inits, ml)


def main():
    p = all_features()
    feeds = {"channel": np.array([["ATM"]], dtype=object), "currency": np.array([["BTC"]], dtype=object),
             "country_code": np.array([["NG"]], dtype=object), "txn_count_24h": np.array([[5]], dtype=np.int32),
             "merchant_category_code": np.array([[6011]], dtype=np.int64), "account_age_days": np.array([[10]], dtype=np.int64),
             "amount_cents": np.array([[100000]], dtype=np.int64), "is_card_present": np.array([[False]]),
             "is_new_device": np.array([[True]]), "is_international": np.array([[True]])}
    got = float(run(p, feeds)[0][0][0])
    want = 0.05 + 0.00001 * 6011 + 0.0001 * 10 + 0.00001 * 100000 + 0 + 0.1 + 0.2 + 0.1 + 0.3 + 0.25
    want = 5 * 0.01 + 6011 * 0.00001 + 10 * 0.0001 + 100000 * 0.00001 + 0.1 + 0.2 + 0.1 + 0.3 + 0.25
    assert abs(got - want) < 1e-4, (got, want)

    # unsupported: a float input
    simple("float_input", [vi("amount", T.FLOAT, [1, 1]), vi("flag", T.BOOL, [1, 1])], vi("risk_score", T.FLOAT, [1, 1]),
           [h.make_node("Cast", ["flag"], ["flag_f"], to=T.FLOAT), h.make_node("Add", ["amount", "flag_f"], ["risk_score"])])
    # unsupported: an input holding several values
    simple("vector_input", [vi("values", T.INT64, [1, 3])], vi("risk_score", T.FLOAT, [1, 1]),
           [h.make_node("Cast", ["values"], ["v_f"], to=T.FLOAT),
            h.make_node("ReduceSum", ["v_f"], ["risk_score"], keepdims=1, axes=None) if False else
            h.make_node("ReduceSum", ["v_f", "axes"], ["risk_score"], keepdims=1)],
           [h.make_tensor("axes", T.INT64, [2], [0, 1])])
    # no usable score: integer output
    simple("int_output", [vi("amount_cents", T.INT64, [1, 1])], vi("risk_score", T.INT64, [1, 1]),
           [h.make_node("Identity", ["amount_cents"], ["risk_score"])])
    # two float outputs: risk_score is the second and must win over "debug"
    save("two_outputs", [vi("amount_cents", T.INT64, [1, 1])],
         [vi("debug", T.FLOAT, [1, 1]), vi("risk_score", T.FLOAT, [1, 1])],
         [h.make_node("Cast", ["amount_cents"], ["a_f"], to=T.FLOAT),
          h.make_node("Mul", ["a_f", "k_debug"], ["debug"]),
          h.make_node("Mul", ["a_f", "k_score"], ["risk_score"])], [c("k_debug", 7.0), c("k_score", 0.001)])
    # double output with an arbitrary name
    simple("double_output", [vi("amount_cents", T.INT64, [1, 1])], vi("score", T.DOUBLE, [1, 1]),
           [h.make_node("Cast", ["amount_cents"], ["a_d"], to=T.DOUBLE), h.make_node("Mul", ["a_d", "k"], ["score"])],
           [c("k", 0.001, T.DOUBLE)])
    # symbolic (dynamic) batch dimension on input and output
    simple("dynamic_dims", [vi("amount_cents", T.INT64, ["N", 1])], vi("risk_score", T.FLOAT, ["N", 1]),
           [h.make_node("Cast", ["amount_cents"], ["a_f"], to=T.FLOAT), h.make_node("Mul", ["a_f", "k"], ["risk_score"])],
           [c("k", 0.001)])
    # rank-0 (scalar) int64 input and scalar output
    simple("scalar_input", [vi("amount_cents", T.INT64, [])], vi("risk_score", T.FLOAT, []),
           [h.make_node("Cast", ["amount_cents"], ["a_f"], to=T.FLOAT), h.make_node("Mul", ["a_f", "k"], ["risk_score"])],
           [c("k", 0.001)])
    # an int32 input, to test range checks
    simple("int32_input", [vi("txn_count_24h", T.INT32, [1, 1])], vi("risk_score", T.FLOAT, [1, 1]),
           [h.make_node("Cast", ["txn_count_24h"], ["a_f"], to=T.FLOAT), h.make_node("Mul", ["a_f", "k"], ["risk_score"])],
           [c("k", 1e-9)])
    # a model with no inputs at all
    simple("no_inputs", [], vi("risk_score", T.FLOAT, [1, 1]),
           [h.make_node("Constant", [], ["risk_score"], value=h.make_tensor("v", T.FLOAT, [1, 1], [0.5]))])
    print("fixtures written:", ", ".join(sorted(f.stem for f in HERE.glob("*.onnx"))))


if __name__ == "__main__":
    main()
