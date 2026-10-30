# 브라우저에 제공하는 공개 모델

- 검출: `ch_PP-OCRv5_det_mobile.onnx`, 4,819,576바이트
- 한국어 인식: `korean_PP-OCRv5_rec_mobile.onnx`, 13,488,748바이트
- 배포 출처: [RapidOCR의 3.10.0 모델 목록](https://github.com/RapidAI/RapidOCR/blob/v3.10.0/python/rapidocr/default_models.yaml)
- 원본 알고리즘: [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR)
- 사용 허가: Apache-2.0. 동봉한 허가 문서를 배포 시 유지한다.
- 문자 사전은 위 한국어 모델의 `character` 메타데이터에서 추출했다. 맨 앞에 빈 토큰, 끝에 공백을 추가한 총 11,947개 항목이다.

`npm run prepare:ocr`로 모델과 실행기 파일을 준비한다. 이미 내려받은 모델을 재사용할 때는 `npm run prepare:ocr -- 경로`로 지정할 수 있다. 두 모델의 검증값은 준비 스크립트에 고정되어 있다. 모델과 실행기 바이너리는 저장소에 포함하지 않는다. `npm run build:ocr-demo`는 준비 명령을 자동으로 실행하며, 다운로드 또는 검증에 실패하면 배포 빌드를 중단한다.

사용자 브라우저는 이 폴더의 정적 파일만 내려받는다. 모델 제공자는 사용자 문서를 받지 않는다. 최초 실행에는 두 모델 약 18.3메가바이트 외에 브라우저 실행기와 문자 사전 다운로드가 필요하다.
