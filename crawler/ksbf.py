import requests
import json
import re
import time
from pathlib import Path
from bs4 import BeautifulSoup

BASE_URL = "https://ksbf.kr"
BOARD_CODE = "b202210139ec652df7c313"
OUTPUT_PATH = Path(__file__).parent.parent / "docs" / "data" / "spots.json"

CATEGORIES = {
    "K4cK7J66T1": "공공스케이트파크",
    "0f5t082E42": "사설스케이트파크",
    "9NK3P0n22w": "스팟",
    "HKP2zu7I62": "스케이트샵",
    "3365oNuW8C": "스케이트보드 강사",
}

HEADERS = {
    "User-Agent": "Mozilla/5.0",
    "Referer": f"{BASE_URL}/Skatemap",
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    "X-Requested-With": "XMLHttpRequest",
}


def get_all_spots():
    resp = requests.post(
        f"{BASE_URL}/ajax/get_map_data.cm",
        headers=HEADERS,
        data={
            "board_code": BOARD_CODE,
            "search": "",
            "search_mod": "all",
            "sort": "TIME",
            "status": "",
        },
    )
    resp.raise_for_status()
    data = resp.json()
    return [json.loads(item) for item in data.get("map_data_array", [])]


def get_spot_detail(idx):
    resp = requests.post(
        f"{BASE_URL}/ajax/map_more_view.cm",
        headers=HEADERS,
        data={
            "idx": idx,
            "board_code": BOARD_CODE,
            "back_url": f"/Skatemap/?sort=TIME#/map{idx}",
            "update_time": "N",
        },
    )
    resp.raise_for_status()
    data = resp.json()
    soup = BeautifulSoup(data.get("html", ""), "html.parser")

    title_div = soup.select_one(".title")
    name = ""
    if title_div:
        for tag in title_div.find_all("a"):
            tag.decompose()
        name = title_div.get_text(strip=True)

    address = ""
    addr_tag = soup.select_one("a.map.detail span")
    if addr_tag:
        address = addr_tag.get_text(strip=True)

    image = ""
    bg_div = soup.select_one(".se_backround_img")
    if bg_div:
        style = bg_div.get("style", "")
        match = re.search(r"url\(([^)]+)\)", style)
        if match:
            image = match.group(1)

    return {"name": name, "address": address, "image": image}


def crawl():
    print("스팟 목록 가져오는 중...")
    markers = get_all_spots()
    print(f"총 {len(markers)}개 스팟 발견")

    spots = []
    for i, marker in enumerate(markers):
        idx = marker.get("idx")
        if not idx:
            continue

        print(f"[{i+1}/{len(markers)}] 스팟 {idx} 상세 정보 가져오는 중...")
        try:
            detail = get_spot_detail(idx)
            spot = {
                "id": idx,
                "name": detail.get("name", ""),
                "category_code": marker.get("category_code", ""),
                "category": CATEGORIES.get(marker.get("category_code", ""), "기타"),
                "lat": float(marker.get("pos_y", 0)),
                "lng": float(marker.get("pos_x", 0)),
                "address": detail.get("address", ""),
                "image": detail.get("image", ""),
                "source": "ksbf",
            }
            spots.append(spot)
        except Exception as e:
            print(f"  오류: {e}")

        time.sleep(0.5)

    OUTPUT_PATH.write_text(json.dumps(spots, ensure_ascii=False, indent=2))
    print(f"\n완료! {len(spots)}개 스팟 저장 → {OUTPUT_PATH}")


if __name__ == "__main__":
    crawl()
