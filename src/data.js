export const GAMES=[
 {id:'valorant',name:'无畏契约',en:'VALORANT',short:'V',color:'#ff4655',soft:'#fff0f1'},
 {id:'cs2',name:'Counter-Strike 2',en:'COUNTER-STRIKE 2',short:'CS',color:'#f0a739',soft:'#faf3e4'},
 {id:'lol',name:'英雄联盟',en:'LEAGUE OF LEGENDS',short:'L',color:'#22b3c9',soft:'#eaf7f5'},
 {id:'apex',name:'Apex Legends',en:'APEX LEGENDS',short:'A',color:'#e3493f',soft:'#fff0ed'}
];
export const GAME=id=>GAMES.find(g=>g.id===id);
export const TEAMS={};
export function today(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
