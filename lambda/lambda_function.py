import json
import os
import re
import uuid
from datetime import datetime

import boto3
from boto3.dynamodb.conditions import Key

TABLE_NAME = os.environ.get("TABLE_NAME", "CalendarBlocks")
dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(TABLE_NAME)

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
TIME_RE = re.compile(r"^\d{2}:\d{2}$")

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "OPTIONS,POST",
}


def response(status_code, payload):
    return {
        "statusCode": status_code,
        "headers": CORS_HEADERS,
        "body": json.dumps(payload),
    }


def parse_body(event):
    body = event.get("body")
    if body is None:
        return {}
    if isinstance(body, dict):
        return body
    if isinstance(body, str):
        body = body.strip()
        if not body:
            return {}
        return json.loads(body)
    raise ValueError("Invalid request body type")


def get_path(event):
    return event.get("path") or event.get("rawPath") or ""


def get_method(event):
    return (
        event.get("httpMethod")
        or event.get("requestContext", {}).get("http", {}).get("method")
        or ""
    ).upper()


def validate_date(date_str):
    if not isinstance(date_str, str) or not DATE_RE.match(date_str):
        return False
    try:
        datetime.strptime(date_str, "%Y-%m-%d")
        return True
    except ValueError:
        return False


def validate_time(time_str):
    if not isinstance(time_str, str) or not TIME_RE.match(time_str):
        return False
    try:
        h, m = map(int, time_str.split(":"))
        return 0 <= h <= 23 and 0 <= m <= 59
    except ValueError:
        return False


def to_minutes(hhmm):
    h, m = map(int, hhmm.split(":"))
    return h * 60 + m


def make_pk(user_id, date):
    return f"USER#{user_id}#DATE#{date}"


def make_sk(start, block_id):
    return f"BLOCK#{start}#{block_id}"


def load_blocks_for_date(user_id, date):
    pk = make_pk(user_id, date)
    result = table.query(
        KeyConditionExpression=Key("pk").eq(pk) & Key("sk").begins_with("BLOCK#")
    )
    items = result.get("Items", [])

    blocks = []
    for item in items:
        blocks.append(
            {
                "blockId": item.get("blockId"),
                "date": item.get("date"),
                "start": item.get("start"),
                "end": item.get("end"),
                "label": item.get("label"),
                "createdAt": item.get("createdAt"),
            }
        )

    blocks.sort(key=lambda b: b.get("start", ""))
    return blocks


def validate_user_and_date(data):
    user_id = data.get("userId")
    date = data.get("date")

    if not isinstance(user_id, str) or not user_id.strip():
        return None, None, "userId is required"
    if not validate_date(date):
        return None, None, "date must be YYYY-MM-DD"

    return user_id.strip(), date, None


def handle_list(data):
    user_id, date, err = validate_user_and_date(data)
    if err:
        return response(400, {"ok": False, "error": err})

    blocks = load_blocks_for_date(user_id, date)
    return response(200, {"ok": True, "blocks": blocks})


def handle_save(data):
    user_id, date, err = validate_user_and_date(data)
    if err:
        return response(400, {"ok": False, "error": err})

    start = data.get("start")
    end = data.get("end")
    label = data.get("label")

    if not validate_time(start):
        return response(400, {"ok": False, "error": "start must be HH:MM (24-hour)"})
    if not validate_time(end):
        return response(400, {"ok": False, "error": "end must be HH:MM (24-hour)"})

    start_min = to_minutes(start)
    end_min = to_minutes(end)
    if end_min <= start_min:
        return response(400, {"ok": False, "error": "end time must be after start time"})

    if not isinstance(label, str) or not label.strip():
        return response(400, {"ok": False, "error": "label is required"})

    label = label.strip()
    if len(label) > 120:
        return response(400, {"ok": False, "error": "label must be 120 characters or fewer"})

    existing_blocks = load_blocks_for_date(user_id, date)
    for block in existing_blocks:
        existing_start = to_minutes(block["start"])
        existing_end = to_minutes(block["end"])
        no_overlap = (end_min <= existing_start) or (start_min >= existing_end)
        if not no_overlap:
            return response(
                400,
                {
                    "ok": False,
                    "error": f"Time overlaps with existing block '{block['label']}' ({block['start']}-{block['end']})",
                },
            )

    block_id = str(uuid.uuid4())
    created_at = datetime.utcnow().isoformat(timespec="seconds") + "Z"

    table.put_item(
        Item={
            "pk": make_pk(user_id, date),
            "sk": make_sk(start, block_id),
            "blockId": block_id,
            "date": date,
            "start": start,
            "end": end,
            "label": label,
            "createdAt": created_at,
        }
    )

    blocks = load_blocks_for_date(user_id, date)
    return response(200, {"ok": True, "message": "Block saved", "blocks": blocks})


def handle_delete(data):
    user_id, date, err = validate_user_and_date(data)
    if err:
        return response(400, {"ok": False, "error": err})

    block_id = data.get("blockId")
    if not isinstance(block_id, str) or not block_id.strip():
        return response(400, {"ok": False, "error": "blockId is required"})
    block_id = block_id.strip()

    pk = make_pk(user_id, date)
    blocks_result = table.query(
        KeyConditionExpression=Key("pk").eq(pk) & Key("sk").begins_with("BLOCK#")
    )

    target_item = None
    for item in blocks_result.get("Items", []):
        if item.get("blockId") == block_id:
            target_item = item
            break

    if not target_item:
        return response(404, {"ok": False, "error": "Block not found"})

    table.delete_item(
        Key={
            "pk": target_item["pk"],
            "sk": target_item["sk"],
        }
    )

    blocks = load_blocks_for_date(user_id, date)
    return response(200, {"ok": True, "message": "Deleted", "blocks": blocks})


def lambda_handler(event, context):
    method = get_method(event)
    if method == "OPTIONS":
        return {
            "statusCode": 200,
            "headers": CORS_HEADERS,
            "body": "",
        }

    try:
        path = get_path(event)

        if method != "POST":
            return response(405, {"ok": False, "error": "Method not allowed. Use POST."})

        data = parse_body(event)

        if path.endswith("/blocks"):
            return handle_save(data)
        if path.endswith("/blocks/list"):
            return handle_list(data)
        if path.endswith("/blocks/delete"):
            return handle_delete(data)

        return response(404, {"ok": False, "error": f"Route not found: {path}"})

    except json.JSONDecodeError:
        return response(400, {"ok": False, "error": "Invalid JSON body"})
    except Exception as e:
        return response(500, {"ok": False, "error": f"Server error: {str(e)}"})
