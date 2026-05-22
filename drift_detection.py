from __future__ import annotations

from collections import Counter
from datetime import UTC, datetime
from typing import Any


ARCHETYPE_MESSAGES = {
    "Strategic Commander": "Campaign stalled. Reassess or abort?",
    "Nurturing Creative": "Your garden needs attention. Gentle nudge.",
    "Steady Achiever": "Streak at risk. 2 tasks to maintain momentum.",
    "Harmonizer": "Someone needs you. And you need rest.",
}

DRIFT_MESSAGE_TEMPLATES = {
    "goal_abandonment": "Key goals have gone cold while work keeps moving elsewhere.",
    "priority_inversion": "Lower-priority tasks are crowding out the highest-value work.",
    "calendar_mismatch": "Your calendar timing does not match what the tasks actually need.",
    "energy_mismatch": "Task intensity is out of sync with your available energy.",
}


def _now() -> datetime:
    return datetime.now(UTC)


def _parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    normalized = value.replace("Z", "+00:00")
    return datetime.fromisoformat(normalized)


def _clamp(score: float) -> float:
    return max(0.0, min(score, 1.0))


def _normalize_tasks(user_data: dict[str, Any]) -> list[dict[str, Any]]:
    tasks = user_data.get("tasks", [])
    projects = {project.get("id"): project for project in user_data.get("projects", [])}
    areas = {area.get("id"): area for area in user_data.get("areas", [])}
    normalized = []

    for task in tasks:
        project = projects.get(task.get("project_id")) or {}
        area = areas.get(task.get("area_id") or project.get("area_id")) or {}
        normalized.append(
            {
                **task,
                "project_name": project.get("name"),
                "goal_area": area.get("name"),
                "completed": bool(task.get("completed") or task.get("status") == "done"),
                "priority": int(task.get("priority", 3)),
                "energy_required": task.get("energy_required", "medium"),
                "scheduled_for": task.get("scheduled_for"),
                "completed_at": task.get("completed_at"),
                "updated_at": task.get("updated_at"),
            }
        )

    return normalized


def detect_goal_abandonment(tasks: list[dict[str, Any]]) -> float:
    now = _now()
    incomplete = [task for task in tasks if not task["completed"]]
    if not incomplete:
        return 0.0

    stale_high_priority = 0
    for task in incomplete:
        updated_at = _parse_datetime(task.get("updated_at"))
        age_days = (now - updated_at).days if updated_at else 14
        if task["priority"] >= 4 and age_days >= 7:
            stale_high_priority += 1

    score = stale_high_priority / max(len(tasks), 1)
    return _clamp(score * 1.5)


def detect_priority_inversion(tasks: list[dict[str, Any]]) -> float:
    completed = [task for task in tasks if task["completed"]]
    if not completed:
        return 0.0

    low_priority_wins = 0
    for task in completed:
        if task["priority"] <= 2:
            low_priority_wins += 1

    overdue_high_priority = 0
    now = _now()
    for task in tasks:
        if task["completed"] or task["priority"] < 4:
            continue
        scheduled_for = _parse_datetime(task.get("scheduled_for"))
        if scheduled_for and scheduled_for < now:
            overdue_high_priority += 1

    weighted_signals = (low_priority_wins * 0.7) + overdue_high_priority
    score = weighted_signals / max(len(tasks), 1)
    return _clamp(score * 1.6)


def detect_calendar_mismatch(tasks: list[dict[str, Any]]) -> float:
    scheduled_tasks = [task for task in tasks if task.get("scheduled_for")]
    if not scheduled_tasks:
        return 0.0

    mismatches = 0
    for task in scheduled_tasks:
        scheduled_for = _parse_datetime(task["scheduled_for"])
        if not scheduled_for:
            continue
        weekday = scheduled_for.weekday()
        if task["priority"] >= 4 and weekday >= 5:
            mismatches += 1
        if task["completed"] is False and scheduled_for.hour < 9 and task["energy_required"] == "high":
            mismatches += 1

    score = mismatches / max(len(scheduled_tasks) * 2, 1)
    return _clamp(score * 1.2)


def detect_energy_mismatch(tasks: list[dict[str, Any]], current_energy: str = "medium") -> float:
    energy_scale = {"low": 1, "medium": 2, "high": 3}
    current = energy_scale.get(current_energy, 2)
    active_tasks = [task for task in tasks if not task["completed"]]
    if not active_tasks:
        return 0.0

    mismatches = 0
    for task in active_tasks:
        required = energy_scale.get(task["energy_required"], 2)
        if required - current >= 1:
            mismatches += 1

    score = mismatches / max(len(active_tasks), 1)
    return _clamp(score * 0.9)


def generate_coaching_message(archetype: str, dominant_drift: str) -> str:
    archetype_message = ARCHETYPE_MESSAGES.get(
        archetype, "You are drifting. Pause, trim scope, and restart with one meaningful task."
    )
    drift_message = DRIFT_MESSAGE_TEMPLATES[dominant_drift]
    return f"{archetype_message} {drift_message}"


def detect_drift(user_data: dict[str, Any]) -> dict[str, Any]:
    tasks = _normalize_tasks(user_data)
    current_energy = user_data.get("current_energy", "medium")
    archetype = user_data.get("archetype", "Steady Achiever")

    drift_scores = {
        "goal_abandonment": detect_goal_abandonment(tasks),
        "priority_inversion": detect_priority_inversion(tasks),
        "calendar_mismatch": detect_calendar_mismatch(tasks),
        "energy_mismatch": detect_energy_mismatch(tasks, current_energy=current_energy),
    }

    sorted_drifts = sorted(drift_scores.items(), key=lambda item: item[1], reverse=True)
    dominant_drift, dominant_score = sorted_drifts[0]
    alerts = []
    for drift_type, score in sorted_drifts:
        if score < 0.35:
            continue
        alerts.append(
            {
                "type": drift_type,
                "score": round(score, 2),
                "message": generate_coaching_message(archetype, drift_type),
            }
        )

    area_counts = Counter(
        task["goal_area"] for task in tasks if not task["completed"] and task.get("goal_area")
    )

    return {
        "archetype": archetype,
        "overall_drift_score": round(sum(drift_scores.values()) / len(drift_scores), 2),
        "dominant_drift": dominant_drift if dominant_score >= 0.35 else None,
        "drift_scores": {key: round(value, 2) for key, value in drift_scores.items()},
        "alerts": alerts,
        "stalled_areas": [area for area, _ in area_counts.most_common(3)],
    }
