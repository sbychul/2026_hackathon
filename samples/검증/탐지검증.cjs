const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { stripTypeScriptTypes } = require('node:module');
const root = path.resolve(__dirname, '../..');
const sample = path.join(root, 'samples/한국어');
const source = fs.readFileSync(path.join(root, 'src/rules/rules.ts'), 'utf8');
const box = {};
new Function('exports', stripTypeScriptTypes(source).replace(/export /g, '') + '\nexports.RULES=RULES;')(box);
const core = new Set(['rrn','phone','email','card']);
const detectorSource=fs.readFileSync(path.join(root,'src/masking/detect.ts'),'utf8');
const projectDetect=new Function('RULES',stripTypeScriptTypes(detectorSource).replace(/^import .*$/gm,'').replace(/export /g,'')+'\nreturn detect;')(box.RULES);

// 프로젝트의 실제 탐지 모듈을 실행하고 정답 비교용 값과 위치를 구성한다.
function detect(text) {
  return projectDetect(text).map(m=>({유형:m.ruleId,이름:box.RULES.find(r=>r.id===m.ruleId).name,값:text.slice(m.start,m.end),시작:m.start,끝:m.end}));
}

// 문자열 목록을 순서와 무관하게 비교할 수 있는 형태로 만든다.
function sorted(items){return items.sort();}

const gold=JSON.parse(fs.readFileSync(path.join(sample,'정답/글자판_핵심4개규칙_정답.json'),'utf8'));
const snapshots=[];
for(const doc of gold){
 const body=fs.readFileSync(path.join(sample,'텍스트',doc.파일.replace(/\.pdf$/,'.txt')),'utf8');
 const actual=detect(body);
 assert.deepEqual(sorted(actual.filter(m=>core.has(m.유형)).map(m=>m.이름+':'+m.값)),sorted(doc.정답.map(m=>m.유형+':'+m.값)),doc.파일);
 snapshots.push({파일:doc.파일,전체탐지:actual,주의:'현행 코드의 관측값이며 특히 이름의 역할 접두어 오탐은 정답으로 승인한 것이 아닙니다.'});
}
const cases=JSON.parse(fs.readFileSync(path.join(sample,'정답/경계사례.json'),'utf8'));
for(const c of cases){
 const matches=detect(c.본문);
 assert.deepEqual(matches.map(m=>m.유형),c.유형,c.설명);
 if(c.값)assert.deepEqual(matches.map(m=>m.값),c.값,c.설명);
}
const demo=detect(fs.readFileSync(path.join(sample,'텍스트/00_전체규칙_통합시연.txt'),'utf8'));
assert.deepEqual(demo.map(m=>m.유형),['name','rrn','phone','email','card','address']);
const baseline=path.join(sample,'정답/글자판_6개규칙_관측값.json');
// 기존 여섯 규칙의 기록을 유지하고 새 계좌번호 규칙은 독립 경계 사례로 검증한다.
const legacySnapshots=snapshots.map(doc=>({...doc,전체탐지:doc.전체탐지.filter(match=>match.유형!=='account')}));
if(process.argv.includes('--기준저장'))fs.writeFileSync(baseline,JSON.stringify(legacySnapshots,null,2)+'\n');
else assert.deepEqual(legacySnapshots,JSON.parse(fs.readFileSync(baseline,'utf8')),'현재 탐지 결과가 기록된 관측값과 다릅니다.');
console.log(JSON.stringify({글자문서:gold.length,핵심4개탐지:gold.reduce((n,d)=>n+d.정답.length,0),기존6개탐지:legacySnapshots.reduce((n,d)=>n+d.전체탐지.length,0),전체7개탐지:snapshots.reduce((n,d)=>n+d.전체탐지.length,0),경계사례:cases.length,통합시연:demo.length}));
