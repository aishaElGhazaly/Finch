from werkzeug.security import check_password_hash, generate_password_hash

from models.db import get_db
from utils.validators import validate_name, validate_email, validate_password


def _verify_password(*, user_id: int, password: str):
    if not password:
        return "Password required"

    with get_db() as conn:
        user = conn.execute(
            "SELECT password_hash FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()

        if not user or not check_password_hash(user["password_hash"], password):
            return "Incorrect password"

    return None


def change_name(*, user_id: int, first_name: str, last_name: str, password: str):
    errors = {}

    first = first_name.strip()
    last = last_name.strip()

    # Validate names
    if not first:
        errors["first_name"] = "First name is required"
    else:
        err = validate_name(first)
        if err:
            errors["first_name"] = err

    if not last:
        errors["last_name"] = "Last name is required"
    else:
        err = validate_name(last)
        if err:
            errors["last_name"] = err

    # Verify password
    pw_err = _verify_password(user_id=user_id, password=password)
    if pw_err:
        errors["password"] = pw_err

    if errors:
        return {"errors": errors}

    with get_db() as conn:
        conn.execute(
            """
            UPDATE users
            SET first_name = ?, last_name = ?
            WHERE id = ?
            """,
            (first, last, user_id),
        )
        conn.commit()

    return {
        "ok": True,
        "first_name": first,
        "last_name": last,
    }


def change_email(*, user_id: int, email: str, password: str):
    errors = {}

    email = email.strip().lower()

    # Validate email
    err = validate_email(email)
    if err:
        errors["email"] = err

    # Verify password
    pw_err = _verify_password(user_id=user_id, password=password)
    if pw_err:
        errors["password"] = pw_err

    if errors:
        return {"errors": errors}

    with get_db() as conn:
        exists = conn.execute(
            "SELECT 1 FROM users WHERE email = ? AND id != ?",
            (email, user_id),
        ).fetchone()

        if exists:
            return {"errors": {"email": "Email already in use"}}

        conn.execute(
            "UPDATE users SET email = ? WHERE id = ?",
            (email, user_id),
        )
        conn.commit()

    return {
        "ok": True,
        "email": email,
    }


def change_password(*, user_id: int, current_password: str, new_password: str):
    errors = {}

    if not current_password:
        errors["current_password"] = "Current password required"

    if not new_password:
        errors["new_password"] = "New password required"

    if errors:
        return {"errors": errors}

    with get_db() as conn:
        user = conn.execute(
            "SELECT password_hash FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()

        if not user or not check_password_hash(
            user["password_hash"], current_password
        ):
            return {"errors": {"current_password": "Incorrect current password"}}

        if check_password_hash(user["password_hash"], new_password):
            return {"errors": {"new_password": "New password must be different"}}

    pw_err = validate_password(new_password)
    if pw_err:
        return {"errors": {"new_password": pw_err}}

    with get_db() as conn:
        new_hash = generate_password_hash(new_password)
        conn.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            (new_hash, user_id),
        )
        conn.commit()

    return {
        "ok": True,
        "relogin": True,
    }


def delete_account(*, user_id: int, password: str):
    errors = {}

    pw_err = _verify_password(user_id=user_id, password=password)
    if pw_err:
        errors["password"] = pw_err

    if errors:
        return {"errors": errors}

    with get_db() as conn:
        conn.execute(
            "DELETE FROM users WHERE id = ?",
            (user_id,),
        )
        conn.commit()

    return {"ok": True}
