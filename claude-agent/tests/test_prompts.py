"""Tests for the system prompt assembly in src/prompts.py."""

from src.prompts import APP_INSTRUCTIONS, CORE_INSTRUCTIONS, get_system_prompt


class TestGetSystemPrompt:
    def test_assembles_app_then_core(self) -> None:
        """The prompt is APP_INSTRUCTIONS followed by CORE_INSTRUCTIONS."""
        assert get_system_prompt() == f"{APP_INSTRUCTIONS}\n\n{CORE_INSTRUCTIONS}"

    def test_includes_app_instructions(self) -> None:
        prompt = get_system_prompt()
        assert APP_INSTRUCTIONS in prompt
        assert "Hexaverse" in prompt

    def test_includes_core_instructions(self) -> None:
        prompt = get_system_prompt()
        assert CORE_INSTRUCTIONS in prompt

    def test_contains_core_instruction_sections(self) -> None:
        """The core scaffolding sections that make tool calling reliable are present."""
        prompt = get_system_prompt()
        assert "## How to use tools" in prompt
        assert "## Formatting" in prompt
        assert "## Safety" in prompt

    def test_app_instructions_come_before_core(self) -> None:
        prompt = get_system_prompt()
        assert prompt.index("Hexaverse") < prompt.index("## How to use tools")

    def test_returns_nonempty_string(self) -> None:
        prompt = get_system_prompt()
        assert isinstance(prompt, str)
        assert prompt.strip()

    def test_composed_fresh_each_call(self) -> None:
        """Composed at request time — repeated calls stay consistent."""
        assert get_system_prompt() == get_system_prompt()


class TestPromptConstants:
    def test_app_instructions_nonempty(self) -> None:
        assert APP_INSTRUCTIONS.strip()

    def test_core_instructions_nonempty(self) -> None:
        assert CORE_INSTRUCTIONS.strip()
