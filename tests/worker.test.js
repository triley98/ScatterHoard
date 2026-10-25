import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { Lobby } from '../server/worker.js';

test('room creation validates and forwards the host-selected mode', async () => {
  let received;
  const env={LOBBIES:{idFromName:code=>code,get:()=>({fetch:async request=>{
    received=await request.json(); return Response.json({ok:true});
  }})}};
  for(const mode of ['arcade','survival']) {
    const response=await worker.fetch(new Request('https://game.test/api/rooms',{
      method:'POST',body:JSON.stringify({mode})}),env);
    assert.equal(response.status,201); assert.equal(received.mode,mode);
  }
  for(const body of ['{','{"mode":"cheat"}']) {
    const response=await worker.fetch(new Request('https://game.test/api/rooms',{method:'POST',body}),env);
    assert.equal(response.status,400);
  }
});

test('active Survival rooms extend their lifetime so endless play is not cut off', async () => {
  for(const mode of ['survival','arcade']) {
    let extended=false, deleted=false;
    const lobby=Object.create(Lobby.prototype);
    lobby.room={game:{mode,phase:'playing'},connected:[true,false]};
    lobby.timer=null; lobby.sockets=new Map();
    lobby.ctx={storage:{setAlarm:async()=>{extended=true;},deleteAll:async()=>{deleted=true;}}};
    await lobby.alarm();
    assert.equal(extended,mode==='survival');
    assert.equal(deleted,mode==='arcade');
  }
});
