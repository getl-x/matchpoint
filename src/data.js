export const GAMES=[
 {id:'valorant',name:'无畏契约',en:'VALORANT',short:'V',color:'#f05b70',soft:'#fff0f1'},
 {id:'cs2',name:'Counter-Strike 2',en:'COUNTER-STRIKE 2',short:'CS',color:'#bc8c38',soft:'#faf3e4'},
 {id:'lol',name:'英雄联盟',en:'LEAGUE OF LEGENDS',short:'L',color:'#428d91',soft:'#eaf7f5'},
 {id:'apex',name:'Apex Legends',en:'APEX LEGENDS',short:'A',color:'#bf5952',soft:'#fff0ed'}
];
export const GAME=id=>GAMES.find(g=>g.id===id);
export const TEAMS={};
export function today(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
