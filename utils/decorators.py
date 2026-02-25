import time
from functools import wraps
from flask import session, flash, redirect, request, url_for


def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if session.get("user_id") is None:
            return redirect("/login")
        return f(*args, **kwargs)
    return decorated_function


def prevent_double_submit(window=3.0):
    def decorator(f):
        @wraps(f)
        def wrapped(*args, **kwargs):
            now = time.time()
            key = f"last_submit::{request.path}"
            last_time = session.get(key, 0)

            if now - last_time < window:
                flash("Processing… please wait.", "warning")
                return redirect(request.referrer or url_for("index"))

            session[key] = now
            return f(*args, **kwargs)
        return wrapped
    return decorator
