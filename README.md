# tryagain

> 스케이트는 끊임없는 자기혐오

내 주변 스케이트보드 스팟

[→ 열어보기](https://currenjin.github.io/tryagain/)

---

## 구조

```
tryagain/
├── crawler/
│   └── ksbf.py        # ksbf.kr 크롤러
└── docs/              # GitHub Pages
    ├── index.html
    ├── app.js
    ├── style.css
    └── data/
        └── spots.json
```

## 데이터 업데이트

```bash
python crawler/ksbf.py
```

매주 월요일 자동 업데이트 (GitHub Actions).

## 로컬 실행

```bash
cd docs && python -m http.server 8000
```
