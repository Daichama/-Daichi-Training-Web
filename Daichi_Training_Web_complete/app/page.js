'use client';
import {useEffect,useMemo,useState} from 'react';
import {initialPlan,templates,ROTATION} from '../lib/data';
const jp=d=>new Intl.DateTimeFormat('ja-JP',{month:'numeric',day:'numeric',weekday:'short'}).format(new Date(d+'T00:00:00'));
const key='dlog-v3-state';
function load(){try{return JSON.parse(localStorage.getItem(key))||null}catch{return null}}
export default function Home(){
 const [state,setState]=useState({plan:initialPlan,logs:[],active:null,timer:false}); const [ready,setReady]=useState(false);
 useEffect(()=>{const s=load();if(s)setState(s);setReady(true)},[]); useEffect(()=>{if(ready)localStorage.setItem(key,JSON.stringify(state))},[state,ready]);
 const today='2026-08-03'; const item=state.plan.find(x=>x.date===today)||state.plan.find(x=>x.part!=='休み');
 const start=(part=item?.part)=>setState(s=>({...s,active:{part,startedAt:new Date().toISOString(),exercises:(templates[part]||[]).map((name,i)=>({id:crypto.randomUUID(),name,order:i,sets:[{kg:'',reps:'',rir:'',done:false}]}))}}));
 if(state.active)return <Workout state={state} setState={setState}/>;
 return <main><header><div><small>D-log v3</small><h1>今日のトレーニング</h1></div><span className="pill">{item?.duty?'当直':''}</span></header>
 <section className="hero"><div><p>{jp(item?.date||today)}</p><h2>{item?.part}</h2></div>{item?.part!=='休み'&&<button onClick={()=>start()}>開始する</button>}</section>
 <section><div className="sectionTitle"><h3>今週・来週</h3><button className="ghost" onClick={async()=>{await fetch('/api/notion-dashboard',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({plan:state.plan})});alert('Notion同期を実行しました')}}>Notionへ同期</button></div>
 <div className="plan">{state.plan.map((x,i)=><div className={'day '+(x.date===today?'today':'')} key={x.date}><div><b>{jp(x.date)}</b><small>{x.duty?'当直 ':''}{x.postDuty?'明け ':''}</small></div><select value={x.part} onChange={e=>setState(s=>({...s,plan:s.plan.map((p,j)=>j===i?{...p,part:e.target.value}:p)}))}>{['休み',...ROTATION].map(v=><option key={v}>{v}</option>)}</select></div>)}</div></section>
 <section><h3>ルーティン</h3><div className="rotation">{ROTATION.map((x,i)=><span key={x}>{x}{i<4?' → ':''}</span>)}</div></section>
 <section><h3>設定</h3><label className="toggle"><input type="checkbox" checked={state.timer} onChange={e=>setState(s=>({...s,timer:e.target.checked}))}/> アプリ内休憩タイマーを使う（初期設定OFF）</label><p className="muted">Apple Watch利用時も、ワークアウト開始・終了時刻と各セット完了時刻は記録します。</p></section>
 </main>}
function Workout({state,setState}){const a=state.active; const addExercise=()=>{const name=prompt('追加する種目名');if(name)setState(s=>({...s,active:{...s.active,exercises:[...s.active.exercises,{id:crypto.randomUUID(),name,order:s.active.exercises.length,sets:[{kg:'',reps:'',rir:'',done:false}]}]}}))};
 const updateSet=(ei,si,k,v)=>setState(s=>{const ex=structuredClone(s.active.exercises);ex[ei].sets[si][k]=v;if(k==='done'&&v)ex[ei].sets[si].completedAt=new Date().toISOString();return {...s,active:{...s.active,exercises:ex}}});
 const addSet=ei=>setState(s=>{const ex=structuredClone(s.active.exercises);ex[ei].sets.push({kg:'',reps:'',rir:'',done:false});return {...s,active:{...s.active,exercises:ex}}});
 const finish=async()=>{const finished={...a,endedAt:new Date().toISOString()};await fetch('/api/sync',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(finished)}).catch(()=>{});setState(s=>({...s,logs:[...s.logs,finished],active:null}));};
 return <main><header><div><small>トレーニング中</small><h1>{a.part}</h1></div><button className="ghost" onClick={addExercise}>＋ 種目追加</button></header>
 {a.exercises.map((e,ei)=><section className="exercise" key={e.id}><div className="sectionTitle"><h3>{e.name}</h3><button className="tiny" onClick={()=>setState(s=>({...s,active:{...s.active,exercises:s.active.exercises.filter((_,j)=>j!==ei)}}))}>削除</button></div>{e.sets.map((set,si)=><div className="set" key={si}><b>{si+1}</b><input inputMode="decimal" placeholder="kg" value={set.kg} onChange={x=>updateSet(ei,si,'kg',x.target.value)}/><input inputMode="numeric" placeholder="回" value={set.reps} onChange={x=>updateSet(ei,si,'reps',x.target.value)}/><select value={set.rir} onChange={x=>updateSet(ei,si,'rir',x.target.value)}><option value="">RIR</option>{[0,1,2,3,4].map(v=><option key={v}>{v}</option>)}</select><button className={set.done?'done':''} onClick={()=>updateSet(ei,si,'done',!set.done)}>{set.done?'✓':'○'}</button></div>)}<button className="addSet" onClick={()=>addSet(ei)}>＋ セット追加</button></section>)}
 <button className="stickyAdd" onClick={addExercise}>＋ 種目追加</button><button className="finish" onClick={finish}>トレーニング終了・同期</button></main>}
