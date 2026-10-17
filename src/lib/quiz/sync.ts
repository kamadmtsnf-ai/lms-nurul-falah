import type {Attempt,AnswerValue} from './types';
export type Answer={position:number;choice:AnswerValue};
export type AnswerBatch={request_id:string;revision:number;answers:Answer[]};
/** Keeps an uncertain request intact until the server acknowledges it. */
export class AnswerQueue{
 readonly pending=new Map<number,AnswerValue>();private packet:AnswerBatch|null=null;
 constructor(private readonly requestId:()=>string=()=>crypto.randomUUID()){}
 change(position:number,choice:AnswerValue){this.pending.set(position,choice);}
 get hasWork(){return this.packet!==null||this.pending.size>0;}
 batch(revision:number):AnswerBatch|null{if(this.packet)return this.packet;if(!this.pending.size)return null;this.packet={request_id:this.requestId(),revision,answers:[...this.pending].map(([position,choice])=>({position,choice}))};this.pending.clear();return this.packet;}
 acknowledge(terminal=false){this.packet=null;if(terminal)this.pending.clear();}
}
export function mayApplyPoll(capturedRevision:number,currentRevision:number,localWork:boolean){return capturedRevision===currentRevision&&!localWork;}
export function savedAnswers(a:Pick<Attempt,'answers'>):Record<number,AnswerValue>{return Object.fromEntries(a.answers.map(x=>[x.position,x.choice]));}
