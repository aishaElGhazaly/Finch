from flask import render_template, request, redirect, url_for, session
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime, date
from dateutil.relativedelta import relativedelta

from . import auth_bp
from models.db import get_db
from extensions import limiter
from utils.validators import validate_name, validate_email, validate_password

@auth_bp.route("/signup", methods=["GET", "POST"])
@limiter.limit("3 per minute")
def signup():
    if request.method == "GET":
        return render_template("signup.html", errors={}, form={})

    # Input collection
    first_name = request.form.get("first_name", "").strip()
    last_name = request.form.get("last_name", "").strip()
    dob = request.form.get("dob", "").strip()
    email = request.form.get("email", "").strip().lower()
    password = request.form.get("password", "").strip()

    errors = {}

    if not all([first_name, last_name, dob, email, password]):
        errors["form"] = "Please fill in all required fields."
    else:
        first_err = validate_name(first_name)
        if first_err:
            errors["first_name"] = first_err

        last_err = validate_name(last_name)
        if last_err:
            errors["last_name"] = last_err

        try:
            dob_obj = datetime.strptime(dob, "%Y-%m-%d").date()
            age = relativedelta(date.today(), dob_obj).years
            if age < 13:
                errors["dob"] = "You must be 13 or older to create an account."
        except ValueError:
            errors["dob"] = "Please enter a valid date of birth."

        email_error = validate_email(email)
        if email_error:
            errors["email"] = email_error
        else:
            with get_db() as conn:
                result = conn.execute(
                    "SELECT id FROM users WHERE email = ?", (email,)
                ).fetchone()
                if result:
                    errors["email"] = "Email already in use."

        pw_error = validate_password(password)
        if pw_error:
            errors["password"] = pw_error

    if errors:
        return render_template("signup.html", errors=errors, form=request.form)

    hashed_pw = generate_password_hash(password)
    with get_db() as conn:
        cursor = conn.execute("""
            INSERT INTO users (first_name, last_name, dob, email, password_hash)
            VALUES (?, ?, ?, ?, ?)
        """, (first_name, last_name, dob, email, hashed_pw))
        conn.commit()
        user_id = cursor.lastrowid

    session.clear()
    session["user_id"] = user_id

    return redirect(url_for("dashboard.index"))


@auth_bp.route("/login", methods=["GET", "POST"])
@limiter.limit("3 per minute")
def login():
    if request.method == "GET":
        return render_template("login.html", errors={}, form={})

    email = request.form.get("email", "").strip().lower()
    password = request.form.get("password", "").strip()

    errors = {}

    if not email or not password:
        errors["form"] = "Please fill in all required fields."
    else:
        with get_db() as conn:
            user = conn.execute(
                "SELECT id, password_hash FROM users WHERE email = ?", (email,)
            ).fetchone()
            if not user or not check_password_hash(user["password_hash"], password):
                errors["form"] = "Email or password is incorrect."

    if errors:
        return render_template("login.html", errors=errors, form=request.form)

    session.clear()
    session["user_id"] = user["id"]
    return redirect(url_for("dashboard.index"))


@auth_bp.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("dashboard.index"))
