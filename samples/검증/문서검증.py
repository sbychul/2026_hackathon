from pathlib import Path
import json
from pypdf import PdfReader
from PIL import Image, ImageChops

ROOT=Path(__file__).resolve().parents[2]
SAMPLE=ROOT/'samples/한국어'

# 글자판과 이미지판의 구조 및 정답 위치를 실제 파일과 비교한다.
def verify():
    text_files=sorted((SAMPLE/'가짜 샘플(이미지X)').glob('*.pdf'))
    image_files=sorted((SAMPLE/'가짜 샘플(이미지O)').glob('*.pdf'))
    assert len(text_files)==20 and len(image_files)==8
    pages=0
    for file in text_files:
        reader=PdfReader(file)
        assert all(len(page.images)==0 for page in reader.pages),file
        actual='\n'.join(page.extract_text() for page in reader.pages)
        expected=(SAMPLE/'텍스트'/file.with_suffix('.txt').name).read_text(encoding='utf-8')
        assert actual==expected,file
        pages+=len(reader.pages)
    assert pages==21
    gold=json.loads((SAMPLE/'정답/이미지판_가림대상과좌표.json').read_text(encoding='utf-8'))
    assert len(gold)==8 and sum(len(d['가림대상정답']) for d in gold)==118
    for d in gold:
        file=SAMPLE/'가짜 샘플(이미지O)'/d['파일']
        reader=PdfReader(file)
        assert len(reader.pages)==1
        page=reader.pages[0]
        assert not page.extract_text().strip() and len(page.images)==1,file
        image=Image.open(file.with_suffix('.png')).convert('RGB')
        embedded=page.images[0].image.convert('RGB')
        assert image.size==embedded.size==tuple(d['크기'])
        assert ImageChops.difference(image,embedded).getbbox() is None,file
        for item in d['가림대상정답']:
            x0,y0,x1,y1=item['영역']
            assert 0<=x0<x1<=image.width and 0<=y0<y1<=image.height
    print('글자판 20개 21쪽, 이미지판 8개, 이미지 8개, 정답 영역 118개 검사 통과')

if __name__=='__main__':
    verify()
