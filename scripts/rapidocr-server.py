"""Loopback-only RapidOCR bridge for the grade register browser UI."""

import json
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from rapidocr import RapidOCR
import cv2
import numpy as np


PORT = 8765
PUBLIC_ORIGIN = "https://group-score-register.epic-basil-1699.chatgpt.site"
LOCAL_ORIGIN = re.compile(r"^http://(?:localhost|127\.0\.0\.1):\d+$")
MAX_IMAGE_BYTES = 8 * 1024 * 1024
engine = RapidOCR()
engine_lock = threading.Lock()


def allowed_origin(origin):
    return origin == PUBLIC_ORIGIN or bool(LOCAL_ORIGIN.fullmatch(origin or ""))


def ordered_lines(result, rating_indexes=()):
    boxes = getattr(result, "boxes", None)
    texts = getattr(result, "txts", None)
    if boxes is None or texts is None:
        return []
    items = []
    for index, (box, text) in enumerate(zip(boxes, texts)):
        if index in rating_indexes:
            continue
        if not isinstance(text, str) or not text.strip():
            continue
        xs = [float(point[0]) for point in box]
        ys = [float(point[1]) for point in box]
        items.append((min(xs), (min(ys) + max(ys)) / 2, max(ys) - min(ys), text.strip()))
    bands = []
    for item in sorted(items, key=lambda value: value[1]):
        _, center_y, height, _ = item
        band = next(
            (candidate for candidate in bands if abs(candidate["y"] - center_y) < max(6, min(candidate["h"], height) * 0.55)),
            None,
        )
        if band is None:
            bands.append({"y": center_y, "h": height, "items": [item]})
        else:
            band["items"].append(item)
    return [" ".join(item[3] for item in sorted(band["items"], key=lambda value: value[0])) for band in bands]


def is_rating_annotation(text):
    if re.search(r"等次|评级|等级|级别|不\s*(?:合格|及格)", text):
        return True
    aliases = r"优秀|良好|中等|合格|及格|优|良|中|差|无"
    boundary = r"[\u3400-\u9fffA-Za-z0-9]"
    text = re.sub(
        r"(?:评定级别|评定等级|活动等次|活动评级|评级|等级|级别|等次|评定)[\s：:]*(?=(?:" + aliases + r")(?!" + boundary + r"))",
        " ", text,
    )
    return bool(re.search(r"(?<!" + boundary + r")(?:" + aliases + r")(?!" + boundary + r")", text))


def top_right_rating_text(result, data):
    boxes = getattr(result, "boxes", None)
    texts = getattr(result, "txts", None)
    if boxes is None or texts is None:
        return "", set()
    image = cv2.imdecode(np.frombuffer(data, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        return "", set()
    height, width = image.shape[:2]
    found = []
    rating_indexes = set()
    for index, (box, text) in enumerate(zip(boxes, texts)):
        if not isinstance(text, str) or not text.strip():
            continue
        center_x = sum(float(point[0]) for point in box) / len(box)
        center_y = sum(float(point[1]) for point in box) / len(box)
        if center_x >= width * 0.55 and center_y <= height * 0.30:
            found.append((center_y, center_x, text.strip()))
            if is_rating_annotation(text):
                rating_indexes.add(index)
    return " ".join(item[2] for item in sorted(found)), rating_indexes


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format_string, *args):
        print("RapidOCR:", format_string % args, flush=True)

    def check_request(self):
        host = self.headers.get("Host", "")
        origin = self.headers.get("Origin", "")
        if host not in (f"127.0.0.1:{PORT}", f"localhost:{PORT}"):
            self.reply(403, {"error": "仅允许本机访问"})
            return False
        if origin and not allowed_origin(origin):
            self.reply(403, {"error": "网页来源不受信任"})
            return False
        return True

    def reply(self, status, value):
        raw = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        origin = self.headers.get("Origin", "")
        if allowed_origin(origin):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Private-Network", "true")
        self.end_headers()
        self.wfile.write(raw)

    def do_OPTIONS(self):
        if not self.check_request():
            return
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", self.headers.get("Origin", ""))
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Vary", "Origin")
        self.end_headers()

    def do_GET(self):
        if not self.check_request():
            return
        if self.path != "/health":
            self.reply(404, {"error": "地址不存在"})
            return
        self.reply(200, {"service": "grade-register-rapidocr", "ready": True})

    def do_POST(self):
        if not self.check_request():
            return
        if self.path != "/recognize":
            self.reply(404, {"error": "地址不存在"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= MAX_IMAGE_BYTES:
                self.reply(413, {"error": "照片不能为空，且不得超过 8 MB"})
                return
            content_type = self.headers.get("Content-Type", "").split(";")[0]
            if content_type not in ("image/jpeg", "image/png", "image/webp"):
                self.reply(415, {"error": "仅支持 JPG、PNG、WebP 照片"})
                return
            data = self.rfile.read(length)
            if len(data) != length:
                self.reply(400, {"error": "照片上传不完整"})
                return
            with engine_lock:
                result = engine(data)
            rating_text, rating_indexes = top_right_rating_text(result, data)
            lines = ordered_lines(result, rating_indexes)
            self.reply(200, {"lines": lines, "ratingText": rating_text, "engine": "RapidOCR"})
        except Exception as exc:
            print("RapidOCR recognition failed:", repr(exc), flush=True)
            self.reply(500, {"error": "本地识别失败，请检查照片或重启 RapidOCR"})


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"RapidOCR 已就绪：http://127.0.0.1:{PORT}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
