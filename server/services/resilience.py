"""Retry helpers and simple circuit breakers for external APIs."""
from __future__ import annotations

import asyncio
import logging
import time
from functools import wraps
from typing import Callable, TypeVar

log = logging.getLogger('voicebridge.resilience')

T = TypeVar('T')


class CircuitOpen(Exception):
    pass


class CircuitBreaker:
    def __init__(self, name: str, failure_threshold: int = 5, reset_seconds: float = 60.0):
        self.name = name
        self.failure_threshold = failure_threshold
        self.reset_seconds = reset_seconds
        self.failures = 0
        self.open_until = 0.0

    def before_call(self) -> None:
        if time.monotonic() < self.open_until:
            raise CircuitOpen(f'{self.name} circuit open')

    def record_success(self) -> None:
        self.failures = 0
        self.open_until = 0.0

    def record_failure(self) -> None:
        self.failures += 1
        if self.failures >= self.failure_threshold:
            self.open_until = time.monotonic() + self.reset_seconds
            log.warning('%s circuit opened for %.0fs', self.name, self.reset_seconds)


groq_breaker = CircuitBreaker('groq')
eleven_breaker = CircuitBreaker('elevenlabs')
openai_breaker = CircuitBreaker('openai')
gemini_breaker = CircuitBreaker('gemini')


async def with_retry(
    fn: Callable[[], T],
    *,
    breaker: CircuitBreaker | None = None,
    attempts: int = 3,
    base_delay: float = 0.4,
) -> T:
    last_err: Exception | None = None
    for i in range(attempts):
        try:
            if breaker:
                breaker.before_call()
            result = await fn()
            if breaker:
                breaker.record_success()
            return result
        except CircuitOpen:
            raise
        except Exception as e:
            last_err = e
            if breaker:
                breaker.record_failure()
            if i < attempts - 1:
                await asyncio.sleep(base_delay * (2 ** i))
    assert last_err is not None
    raise last_err
