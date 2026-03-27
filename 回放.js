javascript: (function () {   let gameSeqNo =     puremvc.Facade.getInstance().model.proxyMap.GameDataProxy.betResult       .gameSeqNo;   generateReplay(`${gameSeqNo}`); })();
