from .services import process_pending_limit_orders


def run_limit_order_processor():
    process_pending_limit_orders()
