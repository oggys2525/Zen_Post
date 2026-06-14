import time
from datetime import datetime

def run_scheduler(posts):
    while True:
        now = datetime.now().strftime("%Y-%m-%d %H:%M")

        for post in posts:
            if post["post_time"] == now:
                print("Posting:", post["caption"])
                # call facebook/tiktok API here

        time.sleep(30)