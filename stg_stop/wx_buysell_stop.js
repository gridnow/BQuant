 require("../js/logger");
 
 function isEscapeSymble(symbol) {
    
    return 0
 }

 class BuySell {
     constructor() {
         this.profileVibLimit = 0.03
         this.profileLostLimit = -0.3
     }
 
    _profitVibCheck(positionTraceInfo, up) {
        // 挣钱？看波动是否跌破阈值
        if (positionTraceInfo.profitMax > 0.03 && up > 0) {
            let profitVib = up - positionTraceInfo.profitMax
            let lostProfitMax = positionTraceInfo.profitMax * this.profileVibLimit
            if (profitVib < 0) {
                if (Math.abs(profitVib) >= lostProfitMax) {
                    return '多头，但是收益' + profitVib.toFixed(3) + '波动大过' +  lostProfitMax.toFixed(3)
                }
            }
        }

        return undefined
     }

     _profitLostCheck(positionTraceInfo, up) {
        // 加仓吗？
        if (up < this.profileLostLimit) {
            return '空头'
        }
        return undefined
     }

     /**
      * 周期调用
      * 止损止盈，通过斜率判断
      * @returns 
      */
    doCheckSell(symbol, positionTraceInfo, price, up, up2) {
        console.log("check " + symbol + " price at " + price + ",up " + up + ",up2 " + up2)

        if (isEscapeSymble(symbol))
            return undefined;
        
        let curPrice = parseFloat(price)
        if (positionTraceInfo.priceMax === undefined) {
            positionTraceInfo.priceMax = 0.0
            positionTraceInfo.priceMin = 1000000.0
            positionTraceInfo.profitMax = -100000.0
        }
        if (positionTraceInfo.profitMax < up)
            positionTraceInfo.profitMax = up
        
        // 多
        if (positionTraceInfo.positionSide == "LONG")
        {
            if (curPrice > positionTraceInfo.priceMax)
                positionTraceInfo.priceMax = curPrice

            let checkRet = this._profitVibCheck(positionTraceInfo, up);
            if (checkRet == undefined) {
                checkRet = this._profitLostCheck(positionTraceInfo, up);
            }
            return checkRet;
        } 
        // 空
        else if (positionTraceInfo.positionSide == "SHORT")
        {
            if (curPrice < positionTraceInfo.priceMin)
                positionTraceInfo.priceMin = curPrice
            
                let checkRet = this._profitVibCheck(positionTraceInfo, up);
                if (checkRet == undefined) {
                    checkRet = this._profitLostCheck(positionTraceInfo, up);
                }
                return checkRet;            
        }

        return undefined
    }
}
exports.BuySell = BuySell;
