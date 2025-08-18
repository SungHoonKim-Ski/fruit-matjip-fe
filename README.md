# 🍎 과일맛집 - 프론트엔드

공동구매 예약 **과일맛집**의 프론트엔드 레포지토리입니다.  
사용자/관리자 웹 화면을 React + TypeScript + TailwindCSS 기반으로 구현했습니다.

---

## 🌐 배포 링크

| 환경 | 유저용 | 관리자용                              |
|------|--------|-----------------------------------|
| 운영 | https://onuljang.store | https://onuljang.store/admin      |
| 테스트 | https://dev.onuljang.store | https://dev.onuljang.store/admin |

+ 백엔드 레포: [onuljang-be](https://github.com/SungHoonKim-Ski/onuljang-be)
---

## 🖼️ 주요 화면

| 구분 | 설명 |이미지 - PC|이미지 - 모바일|
|--------|--------|--------|--------|
|사용자| ![로그인](https://github.com/user-attachments/assets/8d67b176-fafe-4d1a-801d-089e5bc1cc87) |-|-|-|
|사용자| ![상품 목록](https://github.com/user-attachments/assets/fe9ee9c8-6f4c-4b8a-a2e3-fc44dfb43270) |-|-|
|사용자| ![마이페이지](https://github.com/user-attachments/assets/fe9ee9c8-6f4c-4b8a-a2e3-fc44dfb43270) |-|-|
|관리자| ![로그인](https://github.com/user-attachments/assets/fe9ee9c8-6f4c-4b8a-a2e3-fc44dfb43270) |-|-|
|관리자| ![상품 관리](https://github.com/user-attachments/assets/fe9ee9c8-6f4c-4b8a-a2e3-fc44dfb43270) |-|-|
|관리자| ![상품 상세 정보 수정](https://github.com/user-attachments/assets/fe9ee9c8-6f4c-4b8a-a2e3-fc44dfb43270) |-|-|
|관리자| ![예약 관리](https://github.com/user-attachments/assets/fe9ee9c8-6f4c-4b8a-a2e3-fc44dfb43270) |-|-|
|관리자| ![판매량 조회](https://github.com/user-attachments/assets/fe9ee9c8-6f4c-4b8a-a2e3-fc44dfb43270) |-|-|

## ⚙️ 기술 스택

- React 18 (TypeScript)
- React Router
- TailwindCSS
- Axios (API 호출)
- React Query (데이터 캐싱)
- ESLint + Prettier

---

## 🛠️ 주요 기능

- 사용자
  - 상품 예약/취소, 마이페이지 내역 조회
  - 닉네임 중복 체크 및 저장
- 관리자
  - 상품 CRUD + 이미지 업로드 (S3 Presigned URL)
  - 예약 현황 확인
  - 판매량 집계 그래프 조회
- UI
  - 반응형 디자인 (모바일/PC 지원)
  - 공통 Toast 알림 (성공/에러)
