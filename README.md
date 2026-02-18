# 🍎 과일맛집 - 프론트엔드

공동구매 예약 **과일맛집**의 프론트엔드 레포지토리입니다.  
사용자/관리자 웹 화면을 React + TypeScript + TailwindCSS 기반으로 구현했습니다.

---

## 🌐 배포 링크

| 환경 | 유저용 | 관리자용                              |
|------|--------|-----------------------------------|
| 운영 | https://fruit-matjip.store | https://fruit-matjip.store/admin      |
| 테스트 | https://dev.fruit-matjip.store | https://dev.fruit-matjip.store/admin |

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

- React 19 (TypeScript)
- React Router DOM 7
- TailwindCSS
- Fetch API (`src/utils/api.ts` 공통 래퍼)
- react-toastify (에러/알림 토스트)
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

---

## 🎨 브랜딩 설정

이 프로젝트는 **브랜딩 요소(로고, 테마 색상)를 코드에서 분리**하여 관리합니다.  
이를 통해 upstream 변경사항을 자주 머지/리베이스할 때 **충돌을 최소화**할 수 있습니다.

### 브랜딩 변경 방법

1. **환경 변수 설정**
   
   `.env.local` 파일에서 `REACT_APP_BRAND` 값을 변경하세요:
   
   ```bash
   REACT_APP_BRAND=fruit-matjip  # 기본 브랜딩 (오렌지 테마)
   # 또는
   REACT_APP_BRAND=clientA  # 예시 브랜딩 (레드 테마)
   ```

2. **새로운 브랜딩 추가**
   
   `src/brand/` 디렉토리에 새 폴더를 만들고 다음 파일을 추가하세요:
   
   ```
   src/brand/
   ├── fruit-matjip/
   │   ├── theme.ts    # 테마 색상 정의
   │   └── logo.png    # 로고 이미지
   ├── clientA/
   │   ├── theme.ts
   │   └── logo.png
   └── yourBrand/      # 새 브랜딩
       ├── theme.ts
       └── logo.png
   ```

3. **테마 색상 커스터마이징**
   
   `src/brand/yourBrand/theme.ts` 파일에서 색상을 정의하세요:
   
   ```typescript
   export const theme = {
     name: 'yourBrand',
     colors: {
       primary: {
         50: '#your-color',
         // ... 50~950 단계 색상
       }
     }
   };
   ```

### Upstream 머지 시 충돌 최소화 원칙

> **핵심 원칙**: 브랜딩 관련 변경은 `src/brand/` 디렉토리만 수정합니다.

- ✅ **권장**: `src/brand/yourBrand/` 디렉토리에서만 작업
- ✅ **안전**: 새 브랜딩 추가 시 기존 `fruit-matjip/` 폴더는 건드리지 않음
- ❌ **지양**: 코드 전반에 걸쳐 색상/로고 경로를 직접 수정

**작동 원리**:
- 모든 로고 참조는 `import { logo } from '../brand'`를 통해 동적으로 로드됩니다
- 테마 색상은 CSS 변수(`--color-primary-*`)로 주입되며, Tailwind의 `orange-*` 클래스가 자동으로 매핑됩니다
- Upstream 변경사항은 주로 `src/pages/`, `src/components/` 등에서 발생하므로, `src/brand/` 디렉토리와 충돌하지 않습니다

**머지 워크플로우**:
1. Upstream 변경사항을 머지/리베이스
2. 충돌 발생 시 대부분 `src/brand/` 외부 파일이므로 upstream 변경 수용
3. `src/brand/yourBrand/` 내 커스터마이징은 그대로 유지
4. 빌드 및 테스트로 검증
