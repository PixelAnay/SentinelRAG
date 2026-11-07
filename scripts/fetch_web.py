"""Download plain text of ~60 Wikipedia articles as clean web-page content.

Run: python -m scripts.fetch_web
"""
import json
import time

import requests

from sentinel.config import DATA

TITLES = """Solar eclipse|Coffee|Bicycle|Mount Everest|Printing press|Photosynthesis|Jazz|Venice|Honey bee|Tea|
Lighthouse|Volcano|Chess|Rainforest|Telescope|Cheese|Origami|Glacier|Violin|Railway|Marathon|Sourdough|
Coral reef|Typewriter|Pyramid|Bridge|Espresso|Aurora|Tornado|Compass|Penguin|Silk Road|Submarine|Bread|
Sundial|Opera|Desert|Cartography|Pottery|Monsoon|Windmill|Basketball|Moon|Tulip|Canal|Glass|Whale|
Piano|Cathedral|Earthquake|Library|Chocolate|Skateboarding|Bamboo|Meteorite|Lantern|Orchestra|Harbor|Maple syrup""".replace("\n", "").split("|")


def fetch_one(s, title):
    for attempt in range(6):
        r = s.get("https://en.wikipedia.org/w/api.php", params=dict(
            action="query", prop="extracts", explaintext=1, titles=title, format="json", redirects=1), timeout=30)
        if r.status_code == 200:
            return next(iter(r.json()["query"]["pages"].values()))
        time.sleep(20 * (attempt + 1))
    raise RuntimeError("Wikipedia kept rate-limiting; try again later")


def main():
    out = []
    s = requests.Session()
    s.headers["User-Agent"] = "SentinelRAG-research/0.1 (student project)"
    for t in TITLES:
        page = fetch_one(s, t.strip())
        text = (page.get("extract") or "").strip()
        if len(text) > 800:
            out.append(dict(title=page["title"], text=text[:2500]))
        time.sleep(2)
    d = DATA / "web"
    d.mkdir(parents=True, exist_ok=True)
    json.dump(out, open(d / "pages.json", "w", encoding="utf8"), ensure_ascii=False, indent=1)
    print(len(out), "pages")


if __name__ == "__main__":
    main()