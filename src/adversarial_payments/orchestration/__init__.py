"""Red/Blue orchestration: two adversaries choosing moves, not one fixed script."""

from .arena import ArenaResult, Exchange, run_arena
from .orchestrators import BlueOrchestrator, Move, RedOrchestrator, RoundOutcome
from .repertoire import BLUE_PLAYS, RED_PLAYS, BluePlay, RedPlay, blue_play, catalogue, red_play

__all__ = [
    "ArenaResult",
    "Exchange",
    "run_arena",
    "RedOrchestrator",
    "BlueOrchestrator",
    "Move",
    "RoundOutcome",
    "RED_PLAYS",
    "BLUE_PLAYS",
    "RedPlay",
    "BluePlay",
    "red_play",
    "blue_play",
    "catalogue",
]
