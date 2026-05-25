# 스캔 비교기 (ScanCompare)

카메라로 자동차 번호판 / 텍스트 / 바코드를 인식하여 CSV·Excel 파일 데이터와 비교하는 Android 앱

---

## 주요 기능

| 기능 | 설명 |
|------|------|
| 번호판 인식 | ML Kit 한국어 OCR로 자동차 번호판 자동 추출 및 잠금 |
| 텍스트 OCR | 제품번호·시리얼번호 등 한국어/영어 인식 |
| 바코드/QR | CODE128, EAN-13, EAN-8, QR 지원 |
| CSV/Excel 읽기 | UTF-8 CSV, .xls, .xlsx 파일 파싱 |
| 정확 일치 비교 | 스캔값이 파일 데이터와 완전히 일치할 때만 정상 표시 |
| 결과 저장 | 날짜별 폴더에 JSON 파일로 저장 |
| 저장 내역 조회 | 날짜·시간·모드·인식값·결과를 목록으로 확인 |

---

## 화면 구성

```
메인 화면
├── CSV / Excel 파일 불러오기
├── 저장 내역 보기
└── 카메라로 스캔 시작

카메라 화면 (3가지 모드 순환)
├── 텍스트 / 번호 인식 모드
├── 자동차 번호판 인식 모드   ← 가이드 박스 표시
└── 바코드 / QR 스캔 모드    ← 가이드 박스 표시

결과 화면
├── 정상 (초록) / 비정상 (빨강)
├── 인식된 값 표시
├── 일치한 파일 데이터 표시
└── 결과 저장 버튼
```

---

## 스캔 모드

### 번호판 모드
카메라 화면에서 **번호판 모드로 전환** 버튼을 탭하면 활성화됩니다.

지원하는 번호판 형식:

| 형식 | 예시 | 설명 |
|------|------|------|
| 신형 (2019~) | `123가1234` | 숫자3 + 한글1 + 숫자4 |
| 구형 | `12가1234` | 숫자2 + 한글1 + 숫자4 |
| 지역명 포함 | `서울12가1234` | 한글2 + 숫자2 + 한글1 + 숫자4 |

번호판이 인식되는 순간 스캔이 자동으로 잠금되고 **비교하기** 버튼이 나타납니다.

### 텍스트 모드
제품번호, 시리얼번호, 일반 문자를 연속으로 인식합니다.

### 바코드 모드
바코드/QR이 인식되는 순간 스캔이 잠금됩니다.

---

## 비교 로직

스캔된 값과 파일의 모든 셀을 **정확 일치**로만 비교합니다.

- 일치: 파일에서 동일한 값이 발견됨 → **정상** (초록)
- 불일치: 파일에서 발견되지 않음 → **비정상** (빨강)

---

## 결과 저장 및 불러오기

### 저장
결과 화면에서 **결과 저장** 버튼을 누르면 오늘 날짜 폴더에 저장됩니다.

저장 경로:
```
/Android/data/com.example.scancompare/files/
└── 20260525/
    ├── result_153012.json
    ├── result_161540.json
    └── result_174233.json
```

저장되는 내용:
```json
{
  "timestamp": "2026-05-25 15:30:12",
  "date": "20260525",
  "time": "153012",
  "scanModeName": "번호판",
  "scannedText": "123가1234",
  "isNormal": true,
  "message": "정상: 데이터 일치 확인",
  "matchedData": "── 일치 데이터 ──\n★ 번호판: 123가1234\n  소유자: 홍길동"
}
```

### 불러오기
메인 화면에서 **저장 내역 보기** 버튼을 탭하면 저장된 모든 결과를 최신순으로 확인할 수 있습니다.  
각 항목을 탭하면 상세 내용이 표시됩니다.

---

## CSV 파일 형식

```csv
번호판,소유자,차종,비고
123가1234,홍길동,승용차,
456나5678,김철수,SUV,
789다9012,이영희,트럭,특수
```

- 첫 번째 행: 헤더
- 인코딩: UTF-8 권장
- 모든 열을 검색 대상으로 사용

---

## 빌드 방법

### 요구사항

| 항목 | 버전 |
|------|------|
| Android Studio | Iguana 이상 |
| JDK | 17 이상 |
| Android SDK | API 34 |
| 최소 지원 기기 | Android 8.0 (API 26) |

### 커맨드라인 빌드

```powershell
$env:ANDROID_HOME = "D:\android-sdk"
$env:GRADLE_OPTS  = "-Xmx6g -XX:MaxMetaspaceSize=1g"
Set-Location "D:\진행\ScanCompare"
.\gradlew assembleDebug
```

출력 APK: `app\build\outputs\apk\debug\app-debug.apk`

---

## 프로젝트 구조

```
app/src/main/
├── java/com/example/scancompare/
│   ├── MainActivity.kt          # 메인 화면 (파일 로드, 내역 진입)
│   ├── CameraActivity.kt        # 카메라 스캔 (텍스트/번호판/바코드)
│   ├── ResultActivity.kt        # 비교 결과 화면 + 저장
│   ├── HistoryActivity.kt       # 저장 내역 목록 화면
│   └── utils/
│       ├── FileReader.kt        # CSV / Excel 파싱
│       ├── ComparisonEngine.kt  # 정확 일치 비교 + 번호판 패턴 추출
│       └── StorageManager.kt   # 날짜별 폴더 저장 / 불러오기
└── res/layout/
    ├── activity_main.xml
    ├── activity_camera.xml
    ├── activity_result.xml
    ├── activity_history.xml
    └── item_history.xml
```

---

## 권한

| 권한 | 용도 |
|------|------|
| `CAMERA` | 카메라 스캔 |
| `READ_EXTERNAL_STORAGE` | Android 12 이하에서 파일 선택 |

결과 저장은 앱 전용 외부 저장소(`getExternalFilesDir`)를 사용하므로 별도 저장소 권한이 필요 없습니다.
