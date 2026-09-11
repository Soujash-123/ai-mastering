"""Guardrail tests for LLM mastering-JSON extraction/repair (llm.intent)."""
from __future__ import annotations

from llm.intent import _balanced_object, try_repair_json


def test_plain_valid_json_passthrough():
    raw = '{"mastering_chain":{"mastering_style":"pop","target_lufs":-10}}'
    assert try_repair_json(raw) == {
        "mastering_chain": {"mastering_style": "pop", "target_lufs": -10}
    }


def test_markdown_fences_stripped():
    raw = '```json\n{"a":1,"b":2}\n```'
    assert try_repair_json(raw) == {"a": 1, "b": 2}


def test_trailing_prose_ignored():
    raw = 'Here is the plan: {"a":1,"b":2} hope that works {not json}'
    assert try_repair_json(raw) == {"a": 1, "b": 2}


def test_trailing_commas_removed():
    raw = '{"a":1,"b":[1,2,],}'
    assert try_repair_json(raw) == {"a": 1, "b": [1, 2]}


def test_missing_comma_between_members():
    raw = '{"mastering_chain":{"a":1} "loudness_strategy":{"x":1}}'
    assert try_repair_json(raw) == {
        "mastering_chain": {"a": 1},
        "loudness_strategy": {"x": 1},
    }


def test_missing_comma_between_int_key_and_value():
    raw = '{"a":1 "b":2}'
    assert try_repair_json(raw) == {"a": 1, "b": 2}


def test_missing_comma_inside_nested_object():
    raw = '{"eq":{"sub_control_db":0 "bass_weight_db":0}}'
    assert try_repair_json(raw) == {"eq": {"sub_control_db": 0, "bass_weight_db": 0}}


def test_strings_containing_braces_not_corrupted():
    raw = '{"a": "} inside } string", "b": {"c": 1}}'
    assert try_repair_json(raw) == {"a": "} inside } string", "b": {"c": 1}}


def test_valid_number_tokens_untouched():
    raw = '{"a":1.5,"b":-10,"c":2.5,"list":[1, -2, 3]}'
    assert try_repair_json(raw) == {"a": 1.5, "b": -10, "c": 2.5, "list": [1, -2, 3]}


def test_no_json_returns_none():
    assert try_repair_json("I cannot process that.") is None
    assert try_repair_json("") is None
    assert try_repair_json('{"a": '[:-1]) is None


def test_balanced_object_handles_string_with_braces():
    obj = _balanced_object('junk {"a": "} x", "b": {"c": 1}} trailing')
    assert obj == '{"a": "} x", "b": {"c": 1}}'