/** Dependency-free chess rules and alpha-beta engine.
 * Position: {board:{a1:'wR',...}, turn:'w'|'b', castling:{w:{K,Q},b:{K,Q}},
 * enPassant:string|null, halfmoveClock:number, fullmoveNumber:number, repetitionCounts:{} }.
 * Moves: {from:'e2',to:'e4',promotion?:'Q'|'R'|'B'|'N'}. */
const FILES='abcdefgh', PROMOTIONS=['Q','R','B','N'];
const MATERIAL={K:0,Q:900,R:500,B:330,N:320,P:100};
const KNIGHT_STEPS=[[1,2],[2,1],[2,-1],[1,-2],[-1,-2],[-2,-1],[-2,1],[-1,2]];
const KING_STEPS=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
const BISHOP_DIRS=[[1,1],[1,-1],[-1,1],[-1,-1]], ROOK_DIRS=[[1,0],[-1,0],[0,1],[0,-1]];
const square=(f,r)=>FILES[f]+(r+1), coords=(s)=>[FILES.indexOf(s[0]),Number(s[1])-1];
const validSquare=(s)=>typeof s==='string'&&/^[a-h][1-8]$/.test(s);
const colorOf=(p)=>p?.[0]??null, typeOf=(p)=>p?.[1]??null, opposite=(c)=>c==='w'?'b':'w';
function repetitionKey(p){
  const board=Object.keys(p.board).sort().map(s=>`${s}${p.board[s]}`).join(',');
  const rights=['w','b'].map(c=>`${p.castling[c].K?'K':''}${p.castling[c].Q?'Q':''}`).join('');
  return `${board}|${p.turn}|${rights}|${p.enPassant||'-'}`;
}
function normalizePosition(p){if(!p||!p.board||!['w','b'].includes(p.turn))throw new TypeError('Expected a chess position with a board and turn.');return p;}

export function createInitialPosition(){
  const board={}, back=['R','N','B','Q','K','B','N','R'];
  for(let f=0;f<8;f++){board[square(f,0)]=`w${back[f]}`;board[square(f,1)]='wP';board[square(f,6)]='bP';board[square(f,7)]=`b${back[f]}`;}
  const p={board,turn:'w',castling:{w:{K:true,Q:true},b:{K:true,Q:true}},enPassant:null,halfmoveClock:0,fullmoveNumber:1,repetitionCounts:{}};
  p.repetitionCounts[repetitionKey(p)]=1;return p;
}
export const initialPosition=createInitialPosition;
export const INITIAL_POSITION=createInitialPosition();

export function isSquareAttacked(p,sq,by){
  normalizePosition(p);if(!validSquare(sq)||!['w','b'].includes(by))return false;
  const [f,r]=coords(sq),b=p.board,pr=r+(by==='w'?-1:1);
  for(const df of [-1,1])if(f+df>=0&&f+df<8&&b[square(f+df,pr)]===`${by}P`)return true;
  for(const [df,dr] of KNIGHT_STEPS){const x=f+df,y=r+dr;if(x>=0&&x<8&&y>=0&&y<8&&b[square(x,y)]===`${by}N`)return true;}
  for(const [df,dr] of KING_STEPS){const x=f+df,y=r+dr;if(x>=0&&x<8&&y>=0&&y<8&&b[square(x,y)]===`${by}K`)return true;}
  for(const [dirs,pieces] of [[BISHOP_DIRS,['B','Q']],[ROOK_DIRS,['R','Q']]])for(const [df,dr] of dirs){
    let x=f+df,y=r+dr;while(x>=0&&x<8&&y>=0&&y<8){const piece=b[square(x,y)];if(piece){if(colorOf(piece)===by&&pieces.includes(typeOf(piece)))return true;break;}x+=df;y+=dr;}
  }
  return false;
}
export function isInCheck(p,color=p.turn){
  normalizePosition(p);const king=Object.keys(p.board).find(s=>p.board[s]===`${color}K`);
  return king?isSquareAttacked(p,king,opposite(color)):false;
}
function addMove(moves,from,to,promotion){const m={from,to};if(promotion)m.promotion=promotion;moves.push(m);}
function addCastlingMoves(p,from,moves){
  const c=p.turn,rank=c==='w'?0:7,home=square(4,rank),enemy=opposite(c);
  if(from!==home||p.board[home]!==`${c}K`||isInCheck(p,c))return;
  const rights=p.castling[c];
  if(rights.K&&p.board[square(7,rank)]===`${c}R`&&!p.board[square(5,rank)]&&!p.board[square(6,rank)]&&!isSquareAttacked(p,square(5,rank),enemy)&&!isSquareAttacked(p,square(6,rank),enemy))addMove(moves,home,square(6,rank));
  if(rights.Q&&p.board[square(0,rank)]===`${c}R`&&!p.board[square(1,rank)]&&!p.board[square(2,rank)]&&!p.board[square(3,rank)]&&!isSquareAttacked(p,square(3,rank),enemy)&&!isSquareAttacked(p,square(2,rank),enemy))addMove(moves,home,square(2,rank));
}
function pseudoMoves(p,fromFilter){
  const b=p.board,c=p.turn,moves=[],entries=fromFilter?[[fromFilter,b[fromFilter]]]:Object.entries(b);
  for(const [from,piece] of entries){if(!piece||colorOf(piece)!==c)continue;const [f,r]=coords(from),t=typeOf(piece);
    if(t==='P'){
      const step=c==='w'?1:-1,start=c==='w'?1:6,last=c==='w'?7:0,y=r+step;
      if(y>=0&&y<8&&!b[square(f,y)]){if(y===last)PROMOTIONS.forEach(x=>addMove(moves,from,square(f,y),x));else addMove(moves,from,square(f,y));const yy=r+2*step;if(r===start&&!b[square(f,yy)])addMove(moves,from,square(f,yy));}
      for(const df of [-1,1]){const x=f+df,yy=r+step;if(x<0||x>7||yy<0||yy>7)continue;const to=square(x,yy);if((b[to]&&colorOf(b[to])!==c&&typeOf(b[to])!=='K')||to===p.enPassant){if(yy===last)PROMOTIONS.forEach(z=>addMove(moves,from,to,z));else addMove(moves,from,to);}}
    }else if(t==='N'||t==='K'){
      for(const [df,dr] of (t==='N'?KNIGHT_STEPS:KING_STEPS)){const x=f+df,y=r+dr;if(x<0||x>7||y<0||y>7)continue;const to=square(x,y);if(!b[to]||(colorOf(b[to])!==c&&typeOf(b[to])!=='K'))addMove(moves,from,to);}
      if(t==='K')addCastlingMoves(p,from,moves);
    }else{
      const dirs=t==='B'?BISHOP_DIRS:t==='R'?ROOK_DIRS:[...BISHOP_DIRS,...ROOK_DIRS];
      for(const [df,dr] of dirs){let x=f+df,y=r+dr;while(x>=0&&x<8&&y>=0&&y<8){const to=square(x,y);if(!b[to])addMove(moves,from,to);else{if(colorOf(b[to])!==c&&typeOf(b[to])!=='K')addMove(moves,from,to);break;}x+=df;y+=dr;}}
    }
  }return moves;
}
function applyUnchecked(p,m,trackRepetition=true){
  const board={...p.board},piece=board[m.from],c=colorOf(piece),t=typeOf(piece),captured=board[m.to];
  const [ff,fr]=coords(m.from),[tf,tr]=coords(m.to);delete board[m.from];
  if(t==='P'&&m.to===p.enPassant&&ff!==tf&&!captured)delete board[square(tf,tr+(c==='w'?-1:1))];
  board[m.to]=t==='P'&&(tr===0||tr===7)?`${c}${PROMOTIONS.includes(m.promotion)?m.promotion:'Q'}`:piece;
  if(t==='K'&&Math.abs(tf-ff)===2){const rf=square(tf>ff?7:0,fr),rt=square(tf>ff?5:3,fr);board[rt]=board[rf];delete board[rf];}
  const castling={w:{...p.castling.w},b:{...p.castling.b}};if(t==='K')castling[c]={K:false,Q:false};
  if(m.from==='a1'||m.to==='a1')castling.w.Q=false;if(m.from==='h1'||m.to==='h1')castling.w.K=false;
  if(m.from==='a8'||m.to==='a8')castling.b.Q=false;if(m.from==='h8'||m.to==='h8')castling.b.K=false;
  const next={board,turn:opposite(c),castling,enPassant:t==='P'&&Math.abs(tr-fr)===2?square(ff,(fr+tr)/2):null,
    halfmoveClock:t==='P'||captured?0:(p.halfmoveClock||0)+1,fullmoveNumber:(p.fullmoveNumber||1)+(c==='b'?1:0),repetitionCounts:trackRepetition?{...(p.repetitionCounts||{})}:(p.repetitionCounts||{})};
  if(trackRepetition){const key=repetitionKey(next);next.repetitionCounts[key]=(next.repetitionCounts[key]||0)+1;}return next;
}

/** All legal moves, optionally restricted to a source square. */
export function legalMoves(p,from){
  normalizePosition(p);if(from!==undefined&&!validSquare(from))return [];
  return pseudoMoves(p,from).filter(m=>!isInCheck(applyUnchecked(p,m,false),p.turn));
}
export const getLegalMoves=legalMoves;
/** Apply a legal move immutably. Promotion defaults to queen if omitted. */
export function makeMove(p,m){
  normalizePosition(p);if(!m||!validSquare(m.from)||!validSquare(m.to))throw new TypeError('Move must contain valid from and to squares.');
  const legal=legalMoves(p,m.from).find(x=>x.to===m.to&&(m.promotion?x.promotion===m.promotion:!x.promotion||x.promotion==='Q'));
  if(!legal)throw new RangeError(`Illegal move: ${m.from}-${m.to}${m.promotion||''}`);return applyUnchecked(p,legal);
}

export function toFEN(p){
  normalizePosition(p);const rows=[];
  for(let r=7;r>=0;r--){let row='',empty=0;for(let f=0;f<8;f++){const piece=p.board[square(f,r)];if(!piece)empty++;else{if(empty)row+=empty;empty=0;row+=colorOf(piece)==='w'?typeOf(piece):typeOf(piece).toLowerCase();}}if(empty)row+=empty;rows.push(row);}
  const rights=['w','b'].map(c=>`${p.castling[c].K?(c==='w'?'K':'k'):''}${p.castling[c].Q?(c==='w'?'Q':'q'):''}`).join('')||'-';
  return `${rows.join('/')} ${p.turn} ${rights} ${p.enPassant||'-'} ${p.halfmoveClock||0} ${p.fullmoveNumber||1}`;
}
export function fromFEN(fen){
  if(typeof fen!=='string')throw new TypeError('FEN must be a string.');const [placement,turn,rights,ep,half,full]=fen.trim().split(/\s+/),rows=placement?.split('/');
  if(!rows||rows.length!==8||!['w','b'].includes(turn))throw new TypeError('Invalid FEN.');const board={};
  for(let ri=0;ri<8;ri++){let f=0;for(const ch of rows[ri]){if(/^[1-8]$/.test(ch))f+=Number(ch);else if(/^[prnbqkPRNBQK]$/.test(ch)&&f<8){const c=ch===ch.toUpperCase()?'w':'b';board[square(f++,7-ri)]=`${c}${ch.toUpperCase()}`;}else throw new TypeError('Invalid FEN piece placement.');}if(f!==8)throw new TypeError('Invalid FEN rank width.');}
  const p={board,turn,castling:{w:{K:!!rights?.includes('K'),Q:!!rights?.includes('Q')},b:{K:!!rights?.includes('k'),Q:!!rights?.includes('q')}},enPassant:ep&&ep!=='-'?ep:null,halfmoveClock:Number(half)||0,fullmoveNumber:Number(full)||1,repetitionCounts:{}};
  if(p.enPassant&&!validSquare(p.enPassant))throw new TypeError('Invalid FEN en-passant square.');p.repetitionCounts[repetitionKey(p)]=1;return p;
}
export function getStatus(p){
  normalizePosition(p);const moves=legalMoves(p),inCheck=isInCheck(p,p.turn);let result='ongoing',reason=null,winner=null;
  if(!moves.length){result=inCheck?'checkmate':'stalemate';reason=result;if(inCheck)winner=opposite(p.turn);}
  else if((p.repetitionCounts?.[repetitionKey(p)]||0)>=3){result='draw';reason='threefold-repetition';}
  else if((p.halfmoveClock||0)>=100){result='draw';reason='fifty-move-rule';}
  else if(isInsufficientMaterial(p)){result='draw';reason='insufficient-material';}
  return {over:result!=='ongoing',result,reason,winner,inCheck,legalMoves:moves};
}
export const getGameStatus=getStatus;
function isInsufficientMaterial(p){
  const pieces=Object.values(p.board).filter(x=>typeOf(x)!=='K');if(!pieces.length)return true;
  if(pieces.some(x=>['P','Q','R'].includes(typeOf(x))))return false;if(pieces.length===1)return true;
  if(pieces.every(x=>typeOf(x)==='B')){const colors=Object.entries(p.board).filter(([,x])=>typeOf(x)==='B').map(([s])=>{const [f,r]=coords(s);return(f+r)%2;});return colors.every(x=>x===colors[0]);}
  return false;
}

function evaluateWhite(p){
  let score=0;for(const [sq,piece] of Object.entries(p.board)){const c=colorOf(piece),t=typeOf(piece),[f,r]=coords(sq),rr=c==='w'?r:7-r,d=Math.abs(f-3.5)+Math.abs(r-3.5);let pos=0;
    if(t==='P')pos=rr*7-Math.abs(f-3.5)*2;else if(t==='N')pos=24-d*7;else if(t==='B')pos=12-d*3;else if(t==='Q')pos=5-d;else if(t==='K')pos=p.fullmoveNumber<20?d*2:14-d*4;
    score+=(c==='w'?1:-1)*(MATERIAL[t]+pos);
  }return score;
}
function moveOrderScore(p,m){
  const attacker=typeOf(p.board[m.from]),target=p.board[m.to]||(attacker==='P'&&m.to===p.enPassant?'bP':null);
  return(target?10*MATERIAL[typeOf(target)]-MATERIAL[attacker]:0)+(m.promotion?MATERIAL[m.promotion]+800:0);
}
function orderedMoves(p,moves){return moves.sort((a,b)=>moveOrderScore(p,b)-moveOrderScore(p,a));}
function sideEvaluation(p){return evaluateWhite(p)*(p.turn==='w'?1:-1);}
function quiescence(p,alpha,beta,ply,state,qply=0){
  if(++state.nodes>=state.nodeLimit)return sideEvaluation(p);
  const key=repetitionKey(p),checked=isInCheck(p,p.turn);
  if((p.repetitionCounts?.[key]||0)+(state.pathCounts[key]||0)>=3||(p.halfmoveClock||0)>=100||isInsufficientMaterial(p))return 0;
  const allMoves=legalMoves(p);
  if(!allMoves.length)return checked?-100000+ply:0;
  let best=-Infinity;
  if(!checked){
    best=sideEvaluation(p);
    if(best>=beta)return best;
    if(best>alpha)alpha=best;
    if(qply>=8)return best;
  }
  const tactical=checked?allMoves:allMoves.filter(m=>p.board[m.to]||(m.to===p.enPassant&&typeOf(p.board[m.from])==='P'&&m.from[0]!==m.to[0])||m.promotion);
  for(const m of orderedMoves(p,tactical)){
    const child=applyUnchecked(p,m,false),childKey=repetitionKey(child);state.pathCounts[childKey]=(state.pathCounts[childKey]||0)+1;
    const score=-quiescence(child,-beta,-alpha,ply+1,state,qply+1);state.pathCounts[childKey]--;
    if(!state.pathCounts[childKey])delete state.pathCounts[childKey];
    if(score>best)best=score;if(score>alpha)alpha=score;if(alpha>=beta||state.nodes>=state.nodeLimit)break;
  }
  return best;
}
function search(p,depth,alpha,beta,ply,state){
  if(++state.nodes>=state.nodeLimit)return sideEvaluation(p);
  const key=repetitionKey(p),checked=isInCheck(p,p.turn);
  if((p.repetitionCounts?.[key]||0)+(state.pathCounts[key]||0)>=3||(p.halfmoveClock||0)>=100||isInsufficientMaterial(p))return 0;
  const moves=legalMoves(p);if(!moves.length)return checked?-100000+ply:0;
  if(depth<=0)return quiescence(p,alpha,beta,ply,state);
  let best=-Infinity;
  for(const m of orderedMoves(p,moves)){
    const child=applyUnchecked(p,m,false),childKey=repetitionKey(child);state.pathCounts[childKey]=(state.pathCounts[childKey]||0)+1;
    const score=-search(child,depth-1,-beta,-alpha,ply+1,state);state.pathCounts[childKey]--;
    if(!state.pathCounts[childKey])delete state.pathCounts[childKey];if(score>best)best=score;if(score>alpha)alpha=score;if(alpha>=beta||state.nodes>=state.nodeLimit)break;
  }
  return best;
}
/** Choose a legal move; strength is 1–7 or {level, random}. Returns null if game over. */
export function getBotMove(p,strength=2,options={}){
  normalizePosition(p);const level=Math.max(1,Math.min(7,Math.round(typeof strength==='object'?(strength.level??2):strength)));
  const random=(typeof strength==='object'&&strength.random)||options.random||Math.random,moves=orderedMoves(p,legalMoves(p));
  if(!moves.length||getStatus(p).over)return null;
  if(level===1){const ranked=moves.map(m=>({move:m,score:evaluateWhite(applyUnchecked(p,m,false))*(p.turn==='w'?1:-1)+(moveOrderScore(p,m)>0?20:0)})).sort((a,b)=>b.score-a.score);
    const shortlist=ranked.slice(0,Math.max(1,Math.ceil(ranked.length*.55)));return shortlist[Math.floor(random()*shortlist.length)].move;}
  const configs={2:{depth:2,nodes:7000},3:{depth:3,nodes:16000},4:{depth:4,nodes:32000},5:{depth:5,nodes:55000},6:{depth:6,nodes:90000},7:{depth:7,nodes:130000}};
  const {depth:maxDepth,nodes:nodeLimit}=configs[level];let best=moves[0],bestScore=-Infinity,completedDepth=0,rootScores=new Map();
  for(let depth=1;depth<=maxDepth;depth++){
    const state={nodes:0,nodeLimit,pathCounts:{}},ordered=orderedMoves(p,[...moves]);let iterationBest=ordered[0],iterationScore=-Infinity,alpha=-Infinity,beta=Infinity;const iterationScores=new Map();
    for(const m of ordered){
      const child=applyUnchecked(p,m,false),key=repetitionKey(child);state.pathCounts[key]=(state.pathCounts[key]||0)+1;
      const score=-search(child,depth-1,-beta,-alpha,1,state);state.pathCounts[key]--;if(!state.pathCounts[key])delete state.pathCounts[key];
      iterationScores.set(moveKey(m),score);
      if(score>iterationScore){iterationScore=score;iterationBest=m;}if(score>alpha)alpha=score;
      if(state.nodes>=nodeLimit)break;
    }
    if(state.nodes>=nodeLimit&&depth>1)break;
    best=iterationBest;bestScore=iterationScore;rootScores=iterationScores;completedDepth=depth;
    if(Math.abs(iterationScore)>99000)break;
  }
  const book=bookOptions(options.history||[]);
  if(book.moves.size&&completedDepth){
    const bookMove=moves.find(move=>book.moves.has(moveKey(move))),bookScore=bookMove&&rootScores.get(moveKey(bookMove));
    // Keep book moves only when the searched position says they are close to best.
    if(bookMove&&bookScore!==undefined&&bookScore>=bestScore-110)return bookMove;
  }
  if(level<=3&&completedDepth<=2){const nearBest=moves.filter(m=>moveOrderScore(p,m)>=moveOrderScore(p,best)-30);return nearBest[Math.floor(random()*nearBest.length)]||best;}
  return best;
}
export const botMove=getBotMove;

const OPENING_BOOK = [
  { name: 'Ruy Lopez', moves: ['e2e4','e7e5','g1f3','b8c6','f1b5','a7a6','b5a4','g8f6','e1g1','f8e7'] },
  { name: 'Italian Game', moves: ['e2e4','e7e5','g1f3','b8c6','f1c4','f8c5','c2c3','g8f6','d2d4','e5d4'] },
  { name: 'Queen’s Gambit Declined', moves: ['d2d4','d7d5','c2c4','e7e6','b1c3','g8f6','c1g5','f8e7','e2e3','e8g8'] },
  { name: 'Sicilian Defense', moves: ['e2e4','c7c5','g1f3','d7d6','d2d4','c5d4','f3d4','g8f6','b1c3','b8c6'] },
  { name: 'French Defense', moves: ['e2e4','e7e6','d2d4','d7d5','b1c3','g8f6','e4e5','f6d7','f2f4','c7c5'] },
  { name: 'Caro-Kann Defense', moves: ['e2e4','c7c6','d2d4','d7d5','b1c3','d5e4','c3e4','c8f5','e4g3','f5g6'] },
  { name: 'London System', moves: ['d2d4','d7d5','g1f3','g8f6','c1f4','e7e6','e2e3','c7c5','c2c3','b8c6'] },
  { name: 'King’s Indian Defense', moves: ['d2d4','g8f6','c2c4','g7g6','b1c3','f8g7','e2e4','d7d6','g1f3','e8g8'] },
  { name: 'Scotch Game', moves: ['e2e4','e7e5','g1f3','b8c6','d2d4','e5d4','f3d4','g8f6','b1c3','f8b4'] },
];
const moveKey = move => `${move.from}${move.to}${move.promotion || ''}`;
function bookOptions(history = []) {
  const prefix = history.map(moveKey);
  const lines = OPENING_BOOK.filter(line => prefix.length < line.moves.length && prefix.every((key, index) => line.moves[index] === key));
  return { moves: new Set(lines.map(line => line.moves[prefix.length])), name: lines[0]?.name || null };
}
function centralControl(p) {
  const center = ['d4', 'e4', 'd5', 'e5'];
  const score = { w: 0, b: 0 };
  for (const side of ['w', 'b']) for (const sq of center) {
    if (p.board[sq]?.[0] === side) score[side] += 2;
    if (isSquareAttacked(p, sq, side)) score[side] += 1;
  }
  return score;
}
function principleFor(p, move, next, centerGain) {
  const piece = p.board[move.from], type = typeOf(piece), side = colorOf(piece);
  if (type === 'K' && Math.abs(coords(move.to)[0] - coords(move.from)[0]) === 2) return 'King safety: castling';
  if (p.board[move.to] || (type === 'P' && move.to === p.enPassant)) return 'Tactical exchange: review the captured piece and recapture';
  if (type === 'P' && ['d4','e4','d5','e5'].includes(move.to)) return 'Fights for the center';
  const homeRank = side === 'w' ? '1' : '8';
  if (['N','B'].includes(type) && move.from[1] === homeRank) return 'Develops a minor piece';
  if (type === 'Q' && p.fullmoveNumber < 8) return 'Opening principle: develop minor pieces before the queen';
  if (centerGain >= 2) return 'Improves central control';
  if (centerGain <= -2) return 'Central control shifted away';
  if (isInCheck(next, next.turn)) return 'Creates a direct check';
  return 'Principle: improve piece activity and keep the king safe';
}

/** A quick white-perspective evaluation in centipawns, for the live advantage meter. */
export function evaluatePosition(p){normalizePosition(p);return Math.round(evaluateWhite(p));}

/** Review completed moves against a shallow local engine estimate. */
export function analyzeGame(plies,onProgress=()=>{}){
  const moves=[],scores=[{ply:0,score:evaluatePosition(plies[0]?.position||createInitialPosition())}];
  const accuracy={w:[],b:[]},playedMoves=[];
  plies.forEach((entry,index)=>{
    const p=entry.position,move=entry.move;
    if(!move)return;
    const book=bookOptions(playedMoves),bookMove=book.moves.has(moveKey(move));
    const suggested=getBotMove(p,2,{history:playedMoves}),chosenScore=evaluateWhite(applyUnchecked(p,move,false))*(p.turn==='w'?1:-1);
    const suggestedScore=suggested?evaluateWhite(applyUnchecked(p,suggested,false))*(p.turn==='w'?1:-1):chosenScore;
    const loss=Math.max(0,Math.round(suggestedScore-chosenScore));
    const label=loss<=20?'Best':loss<=60?'Good':loss<=130?'Inaccuracy':loss<=300?'Mistake':'Blunder';
    const points=Math.max(0,Math.round(100-Math.min(60,loss*.2)));
    accuracy[p.turn].push(points);
    const next=applyUnchecked(p,move,false),centerBefore=centralControl(p),centerAfter=centralControl(next);
    const centerGain=((centerAfter.w-centerAfter.b)-(centerBefore.w-centerBefore.b))*(p.turn==='w'?1:-1);
    const principle=principleFor(p,move,next,centerGain);
    moves.push({ply:index+1,side:p.turn,move:`${move.from}–${move.to}${move.promotion?`=${move.promotion}`:''}`,best:suggested?`${suggested.from}–${suggested.to}${suggested.promotion?`=${suggested.promotion}`:''}`:'—',loss,label,book:bookMove,opening:bookMove?book.name:null,principle,centerGain,score:evaluatePosition(next)});
    scores.push({ply:index+1,score:evaluatePosition(next)});
    playedMoves.push(move);
    onProgress(index+1,plies.length);
  });
  const average=values=>values.length?Math.round(values.reduce((sum,value)=>sum+value,0)/values.length):0;
  const opening=moves.find(move=>move.opening)?.opening||null;
  return {moves,scores,opening,accuracy:{white:average(accuracy.w),black:average(accuracy.b)}};
}
