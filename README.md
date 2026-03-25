# spotmap

내 주변 스케이트보드 스팟을 지도와 리스트로 확인하는 개인 프로젝트.

## 구조

```
spotmap/
├── data/
│   └── spots.json     # 크롤링된 스팟 데이터
├── crawler/
│   └── ksbf.py        # ksbf.kr/Skatemap 크롤러
└── docs/              # GitHub Pages
    ├── index.html
    ├── app.js
    └── style.css
```

## 데이터 업데이트

```bash
cd crawler
python ksbf.py
```

## 로컬 실행

```bash
cd docs
python -m http.server 8000
```
