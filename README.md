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
|-----------|--------|--------|--------|
|사용자| 로그인|<img width="478" height="313" alt="image" src="https://github.com/user-attachments/assets/4598901a-3dcd-4e6e-a20d-9fb11fec6c6d" />|-|
|사용자| 상품 목록|<img width="659" height="923" alt="image" src="https://github.com/user-attachments/assets/d0d4592c-8753-4855-8e03-38185eed2df4" />|<img width="433" height="842" alt="image" src="https://github.com/user-attachments/assets/9d2c1881-4e1e-4cdc-baad-2e9545cc468b" />|
|사용자| 마이페이지|<img width="901" height="482" alt="image" src="https://github.com/user-attachments/assets/a5446e00-f025-4003-ba9e-e0db8cbb509e" />|<img width="433" height="837" alt="image" src="https://github.com/user-attachments/assets/e1db8956-3ce9-471f-aa6e-4b944a1015ce" />|
|관리자| 로그인|<img width="385" height="356" alt="image" src="https://github.com/user-attachments/assets/0a26284c-c484-40f6-86f4-8979bc64792a" />|-|
|관리자| 회원가입 관리|<img width="418" height="339" alt="image" src="https://github.com/user-attachments/assets/fe6c075c-356b-48c7-b72b-1e7ff8f83257" />|-|
|관리자| 상품 관리|<img width="782" height="677" alt="image" src="https://github.com/user-attachments/assets/e9f5a6d7-6b9b-4688-9843-3b480a07cfb6" />|<img width="417" height="767" alt="image" src="https://github.com/user-attachments/assets/17b2aff9-f6d9-4740-8297-16ae9604155d" />|
|관리자| 상품 상세 정보 수정|<img width="682" height="847" alt="image" src="https://github.com/user-attachments/assets/873a2800-6300-4286-8ac3-2a094d0f5408" />|<img width="429" height="829" alt="image" src="https://github.com/user-attachments/assets/723ff1ec-fb14-4442-97e0-adf8c40839f0" />|
|관리자| 예약 관리|<img width="907" height="677" alt="image" src="https://github.com/user-attachments/assets/1c2b2f12-b238-4331-abe0-2976cd6f3763" />|<img width="416" height="674" alt="image" src="https://github.com/user-attachments/assets/9ad6c7db-829b-4e9b-9a09-e1a39b247704" />|
|관리자| 판매량 조회|<img width="904" height="572" alt="image" src="https://github.com/user-attachments/assets/b9d66dca-c9f1-4ace-ab64-e387ad21caac" />|<img width="414" height="782" alt="image" src="https://github.com/user-attachments/assets/3fcfc3b6-3a7d-41b2-a82b-ddb34e5ac529" />|

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
