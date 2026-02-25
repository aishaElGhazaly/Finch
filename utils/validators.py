import re

def validate_name(name: str):
    if len(name) < 2:
        return "Must be at least 2 characters long."
    if not re.match(r"^[A-Za-z\s\-']+$", name):
        return "Contains invalid characters."
    return None


def validate_email(email: str):
    if not re.match(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$", email):
        return "Please enter a valid email address."
    return None


def validate_password(password: str):
    if len(password) < 8:
        return "Password must be at least 8 characters long."
    if not re.search(r"[A-Z]", password):
        return "Password must include an uppercase letter."
    if not re.search(r"[a-z]", password):
        return "Password must include a lowercase letter."
    if not re.search(r"[0-9]", password):
        return "Password must include a number."
    if not re.search(r"[!@#$%^&*(),.?\":{}|<>]", password):
        return "Password must include a symbol."
    return None
