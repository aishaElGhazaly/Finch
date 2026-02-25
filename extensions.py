from flask_wtf import CSRFProtect
from flask_session import Session
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from apscheduler.schedulers.background import BackgroundScheduler

csrf = CSRFProtect()
session_ext = Session()
scheduler = BackgroundScheduler()

limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["250 per day", "100 per hour"],
    storage_uri="memory://"
)


