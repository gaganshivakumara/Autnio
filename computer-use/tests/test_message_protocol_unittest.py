from __future__ import annotations

import importlib
import json
import pathlib
import sys
import unittest


LAMBDA_DIR = pathlib.Path(__file__).resolve().parents[1] / "lambdas"
if str(LAMBDA_DIR) not in sys.path:
    sys.path.insert(0, str(LAMBDA_DIR))


class FakeTable:
    def __init__(self) -> None:
        self.put_items = []
        self.deleted = []
        self.updated = []
        self.scan_items = []

    def put_item(self, Item):  # noqa: N803
        self.put_items.append(Item)

    def delete_item(self, Key):  # noqa: N803
        self.deleted.append(Key)

    def update_item(self, **kwargs):
        self.updated.append(kwargs)

    def scan(self, **_kwargs):
        return {"Items": self.scan_items}


class WsLambdaTests(unittest.TestCase):
    def test_ws_connect_dev_bypass(self):
        table = FakeTable()
        ws_connect = importlib.reload(importlib.import_module("ws_connect"))
        ws_connect.ALLOW_DEV_BYPASS = True
        ws_connect.connections_table = lambda: table

        event = {
            "requestContext": {"connectionId": "abc123"},
            "queryStringParameters": {"token": "demo-token"},
        }
        result = ws_connect.handler(event, None)
        self.assertEqual(result["statusCode"], 200)
        self.assertEqual(table.put_items[0]["connectionId"], "abc123")
        self.assertEqual(table.put_items[0]["userId"], "demo-user")

    def test_ws_disconnect_deletes_by_connection(self):
        table = FakeTable()
        table.scan_items = [{"userId": "user-1", "connectionId": "conn-1"}]

        ws_disconnect = importlib.reload(importlib.import_module("ws_disconnect"))
        ws_disconnect.connections_table = lambda: table

        event = {"requestContext": {"connectionId": "conn-1"}}
        result = ws_disconnect.handler(event, None)
        self.assertEqual(result["statusCode"], 200)
        self.assertEqual(table.deleted[0], {"userId": "user-1"})

    def test_ws_result_updates_states(self):
        table = FakeTable()
        ws_result = importlib.reload(importlib.import_module("ws_result"))
        ws_result.tasks_table = lambda: table

        output_event = {
            "body": json.dumps({"type": "output", "taskId": "task-1", "data": "chunk-a"})
        }
        done_event = {
            "body": json.dumps({"type": "done", "taskId": "task-1", "result": "final"})
        }
        error_event = {
            "body": json.dumps({"type": "error", "taskId": "task-1", "message": "failed"})
        }

        self.assertEqual(ws_result.handler(output_event, None)["statusCode"], 200)
        self.assertEqual(ws_result.handler(done_event, None)["statusCode"], 200)
        self.assertEqual(ws_result.handler(error_event, None)["statusCode"], 200)

        statuses = [entry["ExpressionAttributeValues"][":status"] for entry in table.updated]
        self.assertEqual(statuses, ["running", "complete", "failed"])


if __name__ == "__main__":
    unittest.main()
