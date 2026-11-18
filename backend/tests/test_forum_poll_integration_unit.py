import asyncio
import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException
from pymongo.errors import DuplicateKeyError

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "rota_segura_test")
os.environ.setdefault("JWT_SECRET", "unit-test-secret")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import server


class Cursor:
    def __init__(self, rows):
        self.rows = rows

    async def to_list(self, length):
        return self.rows[:length]


class ForumPollIntegrationTests(unittest.TestCase):
    def test_linked_forum_records_cannot_be_edited_or_deleted(self):
        user = {"id": "owner", "name": "Pessoa Teste"}
        poll_post = {
            "id": "post-1", "user_id": "owner", "author": "Pessoa", "title": "Enquete",
            "body": "Pergunta", "category": "Discussões gerais", "poll_id": "poll-1",
            "created_at": "2026-01-01T00:00:00+00:00", "liked_by": [],
        }
        self.assertFalse(server.forum_public_post(poll_post, [], user["id"])["can_edit"])
        posts = SimpleNamespace(
            update_one=AsyncMock(return_value=SimpleNamespace(matched_count=0)),
            delete_one=AsyncMock(return_value=SimpleNamespace(deleted_count=0)),
        )
        with patch.object(server, "db", SimpleNamespace(forum_posts=posts)):
            with self.assertRaises(HTTPException) as error:
                asyncio.run(server.forum_edit_post(
                    "post-1",
                    server.ForumPostIn(title="Título válido", body="Texto válido para a discussão", category="Discussões gerais"),
                    user,
                ))
        self.assertEqual(error.exception.status_code, 404)
        query = posts.update_one.call_args.args[0]
        self.assertEqual(query["poll_id"], {"$exists": False})
        self.assertEqual(query["alert_id"], {"$exists": False})

    def test_poll_results_are_aggregated_from_stored_votes_and_link_alert(self):
        poll = {
            "id": "poll-1", "title": "Prioridade", "question": "O que precisa de melhoria?",
            "options": [{"id": "opt-1", "text": "Iluminação"}, {"id": "opt-2", "text": "Sinalização"}],
            "closes_at": "2999-01-01T00:00:00+00:00", "discussion_post_id": "post-1",
            "author": "Pessoa", "created_at": "2026-01-01T00:00:00+00:00", "alert_id": "alert-1",
        }
        vote_collection = SimpleNamespace(
            aggregate=lambda _: Cursor([{"_id": {"poll_id": "poll-1", "option_id": "opt-1"}, "votes": 3},
                                        {"_id": {"poll_id": "poll-1", "option_id": "opt-2"}, "votes": 1}]),
            find=lambda *_: Cursor([{"poll_id": "poll-1", "option_id": "opt-1"}]),
        )
        alert_collection = SimpleNamespace(find=lambda *_: Cursor([{"id": "alert-1", "category": "assalto", "description": "Relato aprovado"}]))
        with patch.object(server, "db", SimpleNamespace(poll_votes=vote_collection, alerts=alert_collection)):
            result = asyncio.run(server.poll_results_for([poll], "voter-1"))[0]
        self.assertEqual(result["total_votes"], 4)
        self.assertEqual([option["votes"] for option in result["options"]], [3, 1])
        self.assertEqual([option["percent"] for option in result["options"]], [75, 25])
        self.assertTrue(result["has_voted"])
        self.assertEqual(result["linked_alert"]["id"], "alert-1")

    def test_duplicate_vote_is_rejected_by_unique_database_index(self):
        poll = {
            "id": "poll-1", "options": [{"id": "opt-1", "text": "Sim"}],
            "closes_at": "2999-01-01T00:00:00+00:00",
        }
        polls = SimpleNamespace(find_one=AsyncMock(return_value=poll))
        votes = SimpleNamespace(insert_one=AsyncMock(side_effect=DuplicateKeyError("duplicate vote")))
        with patch.object(server, "db", SimpleNamespace(polls=polls, poll_votes=votes)):
            with self.assertRaises(HTTPException) as error:
                asyncio.run(server.vote_poll("poll-1", server.PollVoteIn(option_id="opt-1"), {"id": "voter-1"}))
        self.assertEqual(error.exception.status_code, 409)
        index = next(item for item in server.INDEXES["poll_votes"] if item.document["name"] == "poll_user_vote")
        self.assertTrue(index.document["unique"])


if __name__ == "__main__":
    unittest.main()
