import unittest

from drift_detection import detect_drift


MOCK_USER_DATA = {
    "archetype": "Strategic Commander",
    "current_energy": "low",
    "areas": [
        {"id": "a1", "name": "Health"},
        {"id": "a2", "name": "Work"},
    ],
    "projects": [
        {"id": "p1", "name": "Q2 Planning", "area_id": "a2"},
        {"id": "p2", "name": "Training", "area_id": "a1"},
    ],
    "tasks": [
        {
            "id": "t1",
            "title": "Finish quarterly strategy memo",
            "project_id": "p1",
            "priority": 5,
            "energy_required": "high",
            "scheduled_for": "2026-05-03T08:00:00Z",
            "updated_at": "2026-04-20T09:00:00Z",
            "status": "todo",
        },
        {
            "id": "t2",
            "title": "Inbox cleanup",
            "project_id": "p1",
            "priority": 1,
            "energy_required": "low",
            "completed_at": "2026-05-05T16:00:00Z",
            "status": "done",
        },
        {
            "id": "t3",
            "title": "Book annual physical",
            "project_id": "p2",
            "priority": 4,
            "energy_required": "medium",
            "scheduled_for": "2026-05-04T07:30:00Z",
            "updated_at": "2026-04-18T09:00:00Z",
            "status": "todo",
        },
        {
            "id": "t4",
            "title": "Refactor note labels",
            "project_id": "p1",
            "priority": 2,
            "energy_required": "low",
            "completed_at": "2026-05-04T12:00:00Z",
            "status": "done",
        },
    ],
}


class DriftDetectionTests(unittest.TestCase):
    def test_detect_drift_returns_ranked_alerts(self) -> None:
        result = detect_drift(MOCK_USER_DATA)

        self.assertEqual(result["archetype"], "Strategic Commander")
        self.assertGreater(result["overall_drift_score"], 0.35)
        self.assertEqual(result["dominant_drift"], "priority_inversion")
        self.assertGreaterEqual(len(result["alerts"]), 2)
        self.assertIn("Campaign stalled. Reassess or abort?", result["alerts"][0]["message"])

    def test_detect_drift_includes_all_required_score_buckets(self) -> None:
        result = detect_drift(MOCK_USER_DATA)

        self.assertEqual(
            set(result["drift_scores"]),
            {
                "goal_abandonment",
                "priority_inversion",
                "calendar_mismatch",
                "energy_mismatch",
            },
        )
        self.assertIn("Work", result["stalled_areas"])


if __name__ == "__main__":
    unittest.main()
