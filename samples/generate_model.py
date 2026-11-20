"""Generates the demo fraud-risk ONNX model and a matching test CSV (feature values plus the expected score).

Usage:  python generate_model.py        (needs: pip install onnx onnxruntime numpy)

The model takes one input of each supported feature type:
  amount_cents  int64   [1, 1]   transaction amount in minor units
  is_international bool [1, 1]
  country       string  [1, 1]   merchant country (ISO alpha-2, upper case)
and returns  risk_score  float32 [1, 1]  in the range 0..1.

  risk = sigmoid(-3.2 + 0.7 * ln(1 + amount / 50) + 1.8 * international + 1.5 * high_risk_country)
where amount is in currency units (amount_cents / 100) and high_risk_country is NG, RU, KP or IR.
The input is called "country" (not "country_code") on purpose, so the demo shows the
manual drag-and-drop mapping for one input and the automatic name match for the other two.
"""
import csv
import pathlib

import numpy as np
import onnx
import onnxruntime as ort
from onnx import TensorProto, helper

HERE = pathlib.Path(__file__).parent
HIGH_RISK = ["NG", "RU", "KP", "IR"]


def const(name: str, value: float):
    return helper.make_tensor(name, TensorProto.FLOAT, [], [value])


def build() -> onnx.ModelProto:
    inputs = [
        helper.make_tensor_value_info("amount_cents", TensorProto.INT64, [1, 1]),
        helper.make_tensor_value_info("is_international", TensorProto.BOOL, [1, 1]),
        helper.make_tensor_value_info("country", TensorProto.STRING, [1, 1]),
    ]
    outputs = [helper.make_tensor_value_info("risk_score", TensorProto.FLOAT, [1, 1])]
    nodes = [
        helper.make_node("Cast", ["amount_cents"], ["amount_f"], to=TensorProto.FLOAT),
        helper.make_node("Div", ["amount_f", "c_100"], ["amount_units"]),
        helper.make_node("Div", ["amount_units", "c_50"], ["amount_ratio"]),
        helper.make_node("Add", ["amount_ratio", "c_1"], ["amount_ratio_1"]),
        helper.make_node("Log", ["amount_ratio_1"], ["amount_log"]),
        helper.make_node("Mul", ["amount_log", "c_w_amount"], ["amount_term"]),
        helper.make_node("Cast", ["is_international"], ["intl_f"], to=TensorProto.FLOAT),
        helper.make_node("Mul", ["intl_f", "c_w_intl"], ["intl_term"]),
        helper.make_node(
            "LabelEncoder", ["country"], ["country_term"], domain="ai.onnx.ml",
            keys_strings=HIGH_RISK, values_floats=[1.5] * len(HIGH_RISK), default_float=0.0,
        ),
        helper.make_node("Add", ["amount_term", "intl_term"], ["sum_1"]),
        helper.make_node("Add", ["sum_1", "country_term"], ["sum_2"]),
        helper.make_node("Add", ["sum_2", "c_bias"], ["logit"]),
        helper.make_node("Sigmoid", ["logit"], ["risk_score"]),
    ]
    inits = [const("c_100", 100.0), const("c_50", 50.0), const("c_1", 1.0), const("c_w_amount", 0.7),
             const("c_w_intl", 1.8), const("c_bias", -3.2)]
    graph = helper.make_graph(nodes, "fraud_risk_demo", inputs, outputs, initializer=inits)
    model = helper.make_model(
        graph,
        opset_imports=[helper.make_opsetid("", 17), helper.make_opsetid("ai.onnx.ml", 2)],
        producer_name="fraud-runner-samples", producer_version="1.0",
    )
    model.ir_version = 9
    model.doc_string = "Demo fraud risk model: amount, international flag and merchant country."
    onnx.checker.check_model(model)
    return model


def reference(amount_cents: int, intl: bool, country: str) -> float:
    z = -3.2 + 0.7 * np.log(1 + amount_cents / 100 / 50) + (1.8 if intl else 0) + (1.5 if country in HIGH_RISK else 0)
    return float(1 / (1 + np.exp(-z)))


def main():
    model = build()
    path = HERE / "fraud-risk-demo.onnx"
    onnx.save(model, path)

    rows = [(1250, False, "US"), (89900, True, "NG"), (45000, True, "GB")]
    sess = ort.InferenceSession(str(path))
    with open(HERE / "test-data.csv", "w", newline="") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["amount_cents", "is_international", "country_code", "expected_score"])
        for r in rows:
            # the expected score is the model's own score rounded to two decimals, so these cases pass with the default tolerance
            w.writerow([r[0], str(r[1]).lower(), r[2], f"{reference(*r):.2f}"])
    for amount, intl, country in rows:
        out = sess.run(None, {
            "amount_cents": np.array([[amount]], dtype=np.int64),
            "is_international": np.array([[intl]], dtype=np.bool_),
            "country": np.array([[country]], dtype=object),
        })[0]
        got, want = float(out[0][0]), reference(amount, intl, country)
        assert abs(got - want) < 1e-5, (got, want)
        print(f"{amount:>6} {str(intl):>5} {country}  ->  {got:.4f}")
    print("wrote", path.name, "and test-data.csv")


if __name__ == "__main__":
    main()
