"""
Field encryption: default-off behavior (no DynamoDB changes when disabled).
Run: python -m pytest backend/tests/test_field_crypto.py -q
or: python backend/tests/test_field_crypto.py
"""
import os
import sys

# Ensure backend app is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

os.environ.pop("DYNAMODB_FIELD_ENCRYPTION_ENABLED", None)
os.environ.pop("DYNAMODB_FIELD_ENCRYPTION_KMS_KEY_ARN", None)


def test_encryption_inactive_without_env():
    from app.services import field_crypto

    assert field_crypto.is_field_encryption_active() is False
    st = field_crypto.describe_status()
    assert st["active"] is False
    assert st["enabled_flag"] is False


def test_encrypt_pass_through_when_inactive():
    from app.services.field_crypto import encrypt_item_for_write

    item = {"phone": "+15551234567", "email": "a@b.com"}
    out = encrypt_item_for_write("employees", item)
    assert out == item


def test_format_parse_without_table_name_unchanged():
    from app.database_dynamodb import format_dynamodb_item, parse_dynamodb_item

    raw = {"id": "1", "email": "x@y.com", "phone": "+1"}
    fmt = format_dynamodb_item(raw)
    assert fmt == raw
    assert parse_dynamodb_item(fmt) == fmt


if __name__ == "__main__":
    test_encryption_inactive_without_env()
    test_encrypt_pass_through_when_inactive()
    test_format_parse_without_table_name_unchanged()
    print("ok")
