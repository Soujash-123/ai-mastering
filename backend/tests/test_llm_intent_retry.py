"""Guardrail tests for the mastering LLM self-correction retry loop (llm.intent)."""
from __future__ import annotations

from types import SimpleNamespace

import pytest

import llm.intent as intent_mod
from utils.config import get_settings


class _FakeCompletions:
    def __init__(self, responses: list[str]) -> None:
        self.responses = responses
        self.calls: list[list[dict[str, str]]] = []

    def create(self, model: str, messages: list[dict[str, str]]):  # noqa: ANN001
        self.calls.append(messages)
        content = self.responses[min(len(self.calls) - 1, len(self.responses) - 1)]
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=content))])


class _FakeClient:
    def __init__(self, responses: list[str]) -> None:
        self.chat = SimpleNamespace(completions=_FakeCompletions(responses))


@pytest.fixture
def llm_settings(monkeypatch):
    monkeypatch.setattr(get_settings(), "groq_api_key", "test-key")


def make(client: _FakeClient, monkeypatch) -> _FakeClient:
    monkeypatch.setattr(intent_mod, "OpenAI", lambda base_url, api_key: client)
    return client


def test_recovery_from_syntax_broken_json(
    monkeypatch, llm_settings  # noqa: ARG001
):
    broken = '{"mastering_chain":{"mastering_style":"glassy"} "loudness_strategy":{"target_lufs":-10}}'
    good = '{"mastering_chain":{"mastering_style":"glassy"},"loudness_strategy":{"target_lufs":-10}}'
    fake = _FakeClient([broken, good])
    make(fake, monkeypatch)

    intent, report, raw = intent_mod.generate_mastering_plan({})

    assert raw["repair_attempts"] == 1
    assert raw["fallback_defaults"] is False
    assert raw["raw"]["loudness_strategy"]["target_lufs"] == -10
    assert intent.mastering_chain.mastering_style == "glassy"
    assert len(fake.chat.completions.calls) == 2
    # second call asks for a self-correction of the previous bad output
    assert "not valid JSON" in fake.chat.completions.calls[1][-1]["content"]


def test_falls_back_to_defaults_when_repairs_exhausted(monkeypatch, llm_settings):  # noqa: ARG001
    bad = 'just total garbage not json at all {{{'
    fake = _FakeClient([bad, bad, bad])
    make(fake, monkeypatch)

    monkeypatch.setattr(get_settings(), "mastering_llm_retries", 2)
    intent, report, raw = intent_mod.generate_mastering_plan({})

    assert raw["fallback_defaults"] is True
    assert raw["repair_attempts"] == 2
    assert raw["raw"] == {}
    assert intent.mastering_chain.mastering_style == ""  # default plan produced
    assert len(fake.chat.completions.calls) == 3  # initial + 2 repairs


def test_single_valid_response_no_repair(monkeypatch, llm_settings):  # noqa: ARG001
    good = '{"mastering_chain":{"mastering_style":"warm"}}'
    fake = _FakeClient([good])
    make(fake, monkeypatch)

    intent, report, raw = intent_mod.generate_mastering_plan({})

    assert raw["repair_attempts"] == 0
    assert raw["fallback_defaults"] is False
    assert raw["raw"]["mastering_chain"]["mastering_style"] == "warm"
    assert len(fake.chat.completions.calls) == 1