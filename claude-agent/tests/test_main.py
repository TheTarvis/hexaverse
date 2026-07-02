"""Tests for the main FastAPI application."""

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from src.main import (
    configure_logging,
    get_anthropic_client,
    get_api_client,
)


class TestHealthEndpoints:
    def test_health_check(self, client: TestClient) -> None:
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert "version" in data
        assert "environment" in data

    def test_root_endpoint(self, client: TestClient) -> None:
        response = client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert data["service"] == "claude-agent"
        assert data["status"] == "ok"


class TestConfigureLogging:
    @patch("src.main.structlog.configure")
    @patch("src.main.get_settings")
    def test_configure_logging_development(self, mock_get_settings, mock_configure) -> None:
        mock_settings = MagicMock()
        mock_settings.environment = "development"
        mock_settings.log_level = "DEBUG"
        mock_get_settings.return_value = mock_settings

        configure_logging()

        mock_configure.assert_called_once()

    @patch("src.main.structlog.configure")
    @patch("src.main.get_settings")
    def test_configure_logging_production(self, mock_get_settings, mock_configure) -> None:
        mock_settings = MagicMock()
        mock_settings.environment = "production"
        mock_settings.log_level = "INFO"
        mock_get_settings.return_value = mock_settings

        configure_logging()

        mock_configure.assert_called_once()


class TestClientAccessors:
    def test_get_api_client_raises_when_not_initialized(self) -> None:
        with patch("src.main._api_client", None), pytest.raises(RuntimeError):
            get_api_client()

    def test_get_anthropic_client_raises_when_not_initialized(self) -> None:
        with patch("src.main._anthropic_client", None), pytest.raises(RuntimeError):
            get_anthropic_client()
