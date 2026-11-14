function isRecentGameOut(window,now){return window.game>=2&&now-window.lastGameOut<=120;}
module.exports={isRecentGameOut};
