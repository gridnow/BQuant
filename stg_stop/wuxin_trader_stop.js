/**
 * 策略几个要求：
 * 1，止损：固定止损虽然本笨，但是有效。
 * 2，止盈：在x时间内徘徊的，直接止盈。在x时间内持续走势的，保持观望。
 */
require("../js/logger");
const fs = require("fs");
const EventEmitter = require('events');
const { BianAPI }  = require("../js/bapi");
const {BuySell}   = require("./wx_buysell_stop")

var gSelectInt = ""

class Trader extends EventEmitter {
    constructor() {
        /**
         * @type {{[symbol: string]: PositionTraceInfo}}
         */
        super();
        this.allContracts = null;
        this.openOrders = [];
        this.positionTraceInfo = {};
        this.positionTouchId = 0;
        this.websocketClose = true;

        this.bapi = new BianAPI();
        this.stgBuySell = new BuySell();

        this.subscribeMarkPriceDelay = []
        this.unsubscribeMarkPriceDelay = []
        this.orderMonitor();
    }

    async createWatcher(again=false) {
        // 建立websocket行情推送
        await this.bapi.accountListenKeyInfoInit();
        await this.bapi.webSocketInit();
        
        this.websocketClose = false;
        this.bapi.on("open", () => {
            console.log('bapi websocket connect success');
        });

        // again 是用来防治事件被注册两次（重连的时候再注册一次)
        this.bapi.on("close", () => {
            console.log('bapi websocket connect close');
            if (!this.websocketClose) {
                this.emit("websocketClose")
            }
            this.websocketClose = true;
        });
        this.bapi.on('markPriceUpdate', (d) => {
            this.onMarkPriceChange(d)
        })
        this.bapi.on('orderTradeUpdate', (d) => {
            this.onOrderTradeUpdate(d)
        })
        this.bapi.on('accountUpdate', (d) => {
            this.onAccountUpdate(d)
        })
        await this.loadPositionsFromRemote();
        await this.load_open_orders();
        // 读取所有合约信息，用于解决tickSize 等配置问题
        let ret = await this.bapi.getAllContracts();
        this.allContracts = ret;
    }

    async deattach() {
        return this.bapi.deattach();
    }

    async getPositionSide() {
        return this.bapi.getPositionSide();
    }

    /**
     * 订单监控
     * 需要定时对已经下单的订单进行监控，取消超时的订单
     */
    orderMonitor() {
        setInterval(async () => {
            console.log("----------orderMonitor------------")
            let positionSymbolsWithDir = Object.keys(this.positionTraceInfo);
            for (let symbolDir of positionSymbolsWithDir) {
                let traceInfo = this.positionTraceInfo[symbolDir];
                console.log("    traceInfo", traceInfo);
            }
            console.log("----------------------------------\n\n\n")
        }, 1000 * 10);

        /* subscribe the price with rate limit */
        setInterval(async() => {
            let symbol = this.subscribeMarkPriceDelay.pop()
            if (symbol != undefined) {
                this.bapi.subscribeMarkPrice(symbol);
            } else {
                symbol = this.unsubscribeMarkPriceDelay.pop()
                if (symbol != undefined) {
                    this.bapi.unsubscribeMarkPrice(symbol);
                }
            }
        }, 110);
    }

    /**
     * 订阅markPrice
     * 
     * @param {string} symbol 交易对
     */
    subscribeMarkPrice(symbol) {
        this.subscribeMarkPriceDelay.push(symbol)
    }

    /**
     * 取消markPrice
     * 
     * @param {string} symbol 交易对
     */
    unsubscribeMarkPrice(symbol) {
        this.unsubscribeMarkPriceDelay.push(symbol)
    }

    async doSell(positionTraceInfo, reason) {
        let quantity = parseFloat(positionTraceInfo.quantity)
        try {
            const order = {
                symbol: positionTraceInfo.symbol, 
                side: positionTraceInfo.positionSide == "LONG" ? "SELL": "BUY", 
                positionSide: positionTraceInfo.positionSide, 
                type: "MARKET", 
                quantity
            };
            console.log("Do sell for order", order)
            const orderResult = await this.order(order);
            console.log("sell order ", {
                s: positionTraceInfo.symbol,
                buyPrice: positionTraceInfo.orderPrice,
                reason: reason
            });
            console.log("sell order result", orderResult)
        } catch (e) {
            console.error("创建SELL订单出问题了：", e.stack);
        }
    }
    
    async onMarkPriceChangeDoSomething(positionTraceInfo, curPrice, curPrice2) {
        const symbol = positionTraceInfo.symbol
        
        /**
         * 按照交易价格跟当前的价格（标记价格？）计算涨跌幅
         */
        let up = ((parseFloat(curPrice) - positionTraceInfo.orderPrice) / positionTraceInfo.orderPrice);
        if (positionTraceInfo.positionSide == "SHORT") {
            up = -up;
        }
        let up2 = ((parseFloat(curPrice2) - positionTraceInfo.orderPrice) / positionTraceInfo.orderPrice);
        if (positionTraceInfo.positionSide == "SHORT") {
            up2 = -up2;
        }

        /**
         * 简单粗暴止盈止损
        */
        let reason = this.stgBuySell.doCheckSell(symbol, positionTraceInfo, curPrice, up * positionTraceInfo.leverage, up2 * positionTraceInfo.leverage);
        if (reason != undefined) {
            await this.doSell(positionTraceInfo, reason)
        }
    }

    /**
     * 标记价格更新
     * @param {BianWSEventMarkPrice} payload 交易对
     */
    async onMarkPriceChange(payload) {
        const symbol = payload.s;

        // 现货指数价格
        const curPrice = payload.i
        const curPrice2 = payload.p
        var symbolDir;
        var positionTraceInfo;

        symbolDir = symbol + "_" + "LONG";
        positionTraceInfo = this.positionTraceInfo[symbolDir];
        if (positionTraceInfo) {
            await this.onMarkPriceChangeDoSomething(positionTraceInfo, curPrice, curPrice2)
        }

        symbolDir = symbol + "_" + "SHORT";
        positionTraceInfo = this.positionTraceInfo[symbolDir];
        if (positionTraceInfo) {
            await this.onMarkPriceChangeDoSomething(positionTraceInfo, curPrice, curPrice2)
        }
    }

    /**
     * 订单交易更新，包括未成交的
     * 
     * @param {BianWSEventOrderTradeUpdate} payload 订单更新数据
     */
    onOrderTradeUpdate(payload) {
        console.log('onOrderTradeUpdate payload ', payload);
        let eventData = payload.o;
        let symbol = eventData.s;
        let tradeSide = eventData.S;
        let orderId = eventData.i;
        let positionSide = eventData.ps;
        let symbolDir = symbol + "_" + positionSide;
        let traceInfo = this.positionTraceInfo[symbolDir]

        /* 从OpenOder 中查询，看看是不是这些发生了变化 */
        if (this.checkEventForOpenOrderChange(eventData) == true) {
            console.log("checkEventForOpenOrderChange result", this.openOrders);
        }
       
        /* 拉一遍仓位 */
        this.loadPositionsFromRemote();
    }

    /**
     * 用户账户更新
     * 目前只有账户额度变化、仓位增删变化
     * 目前没用
     * 
     * @param {BianWSEventAccountUpdate} payload 负载
     */
    async onAccountUpdate(payload) {
        const positions = payload.a.P;
        console.log("onAccountUpdate:", payload);
    }

    /**
     * 获取用户总余额
     * 
     * @see https://binance-docs.github.io/apidocs/futures/cn/#v2-user_data
     * 
     * @param {string} asset 资产
     * @returns {Promise<BalanceInfo>}
     */
    async getBanlance(asset) {
        return this.bapi.getBanlance(asset);
    }

    /**
     * 获取持仓
     * 
     * @see https://binance-docs.github.io/apidocs/futures/cn/#v2-user_data
     * 
     * @returns {Promise<PositionInfo[]>}
     */
    async getPositions() {
        return this.bapi.getPositions();
    }

    /**
     * 用户账户损益资金流水
     * 
     * @see https://binance-docs.github.io/apidocs/futures/cn/#user_data-8
     */
    async getIncome() {
        return this.bapi.getIncome();
    }

    /**
     * 下单
     * @param {string} symbol  交易对
     * @param {"SELL" | "BUY"} side 买卖方向
     * @param {"LIMIT" | "MARKET"} type 下单类型：限价，市价
     * @param {"BOTH" | "LONG" | "SHORT"} positionSide   持仓方向
     * @param {string} [price]  委托价格
     * @param {string} [quantity]  下单数量
     * @returns {Promise<BinanOrderResult>}
     * @see https://binance-docs.github.io/apidocs/futures/cn/#trade-3
     */
    async order(order) {
        return this.bapi.order(order);
    }

    /**
     * 撤销订单
     */
    async orderCancel(symbol, orderId) {
        // TODO: 取消订单
        this.bapi.orderCancel(symbol, orderId);
    }

    /**
     * 批量下单
     * 
     * @param {TraderOrder} orders 订单列表
     * @returns {Promise<BinanOrderResult[]>}
     */
    async batchOrder(orders) {
        return this.bapi.batchOrder(orders)
    }

    /**
     * 调整下单杠杆
     * @param {string} symbol 交易对
     * @param {number} leverage 杠杆
     */
    async adjustLeverage(symbol, leverage) {
        return this.bapi.adjustLeverage(symbol, leverage);
    }

    async loadPositionsFromRemote() {
        let positions = await this.getPositions();
        console.log("Load positions from remote ", positions);
        let traceInfos = positions.map((p) => {
            return {
                symbol: p.symbol,
                status: "FILLED",
                lastTimestamp: Date.now(),
                orderPrice: parseFloat(p.entryPrice),
                positionSide: p.positionSide,
                quantity: Math.abs(1.0 * p.positionAmt),
                leverage: parseInt(p.leverage),
            };
        })

        this.positionTouchId = this.positionTouchId + 1;
        for (let tr of traceInfos) {
            let symbolDir = tr.symbol + "_" + tr.positionSide
            let origin = this.positionTraceInfo[symbolDir];
            if (origin) {
                origin._positionTouchId = this.positionTouchId
                continue;
            }
            this.positionTraceInfo[symbolDir] = tr;
            tr._positionTouchId = this.positionTouchId
            this.subscribeMarkPrice(tr.symbol)
        }

        let positionSymbolsWithDir = Object.keys(this.positionTraceInfo);
        for (let symbolDir of positionSymbolsWithDir) {
            let tr = this.positionTraceInfo[symbolDir];
            if (tr._positionTouchId != this.positionTouchId) {
                this.unsubscribeMarkPrice(tr.symbol)
                delete this.positionTraceInfo[symbolDir]
            }
        }
    }

    /**
     * Open BOOK, 未成交订单
     */
    addToOpenBook(symbol, o) {
        if (this.openOrders[symbol] == null)
            this.openOrders[symbol] = [];
        this.openOrders[symbol].push(o);
    }
    addToOpenBookByEvent(event) {
        let symbol = event.s
        /*
        orderId: 227370950,
        symbol: 'EOSUSDT',
        status: 'NEW',
        clientOrderId: 'web_Q2pc6MpHKL6MtCTnOVZ9',
        price: '0.500',
        avgPrice: '0',
        origQty: '22',
        executedQty: '0',
        cumQuote: '0',
        timeInForce: 'GTC',
        type: 'LIMIT',
        reduceOnly: false,
        closePosition: false,
        side: 'BUY',
        positionSide: 'LONG',
        stopPrice: '0',
        workingType: 'CONTRACT_PRICE',
        priceProtect: false,
        origType: 'LIMIT',
        time: 1677559922464,
        updateTime: 1677559922464
      */
        var obj = {
            orderId:event.i,
            symbol:event.s,
            status:event.X,
            price:event.p,
            side:event.S,
            positionSide:event.ps,
            type:event.ot,
            reduceOnly:event.R,
            workingType:event.wt,
            origType:event.ot,
            origQty:event.q
        }
        this.openOrders[symbol].push(obj);
    }

    checkEventForOpenOrderChange(event) {
        let symbol = event.s
        let objs = this.openOrders[symbol];
        if (!objs) {
            if (event.X == 'NEW') {
                this.openOrders[symbol] = [];
                this.addToOpenBookByEvent(event)
                return true
            }
            console.log("The order event status", event.X, "cannot be handled properly at early stage.")
            return false
        }

        // check the order status
        for (var o in objs) {
            let order = objs[o]
            if (order.orderId == event.i) {
                console.log("checkEventForOpenOrderChange mached orderId", event.i)
                if (event.X == 'CANCELED') {
                    objs.splice(o, 1)
                    return true
                } else if (event.X == 'FILLED') {
                    objs.splice(o, 1)
                    return true
                } else if (event.X == 'PARTIALLY_FILLED') {
                    return true
                }
            }
        }

        // NOT in the opening order book
        if (event.X == 'NEW') {
            this.addToOpenBookByEvent(event)
            return true
        } else {
            console.log("The order event status", event.X, "cannot be handled properly.")
        }
        return false;
    }
    getOpenOrderCount () {
        var count = 0;
        for (var i in this.openOrders) {
            var objs = this.openOrders[i]
            // check the order status
            for (var o in objs) {
                count = count + 1;
            }
        }
        return count;
    }
    async load_open_orders() {
        let openOrders = await this.bapi.getAllOpenOrder();
        /**
         * rebuild 开多/开空/平多/平空
         */
        for (let o of openOrders) {
            this.addToOpenBook(o.symbol, o)
        }
        console.log("all opening orders rebuiled", this.openOrders);
    }

    // Nothing to do, all trigger buy push
    async exec(maxPositions = 10, leverage = 6, limitBalance="5000.0") {
        if (this.websocketClose) {
            console.log("trader stop exec, reason websocket disconnect");
            return;
        }
    }
}


async function main() {
    let positionCount = 10
    let leverage = 6
    let maxBalance = "1000.0"

    gSelectInt = "15m"

    const t = new Trader();
    console.log("Starting...", gSelectInt)
    await t.createWatcher(false);
    console.log("获取仓位模式 ", await t.getPositionSide());
    t.on('websocketClose', async () => {
        console.log("Trader websocket disconnect, reconnect it");
        await t.deattach();
        await t.createWatcher(true);
    })

    await t.exec(positionCount, leverage, maxBalance);
    setInterval(()=> {
        t.exec(positionCount, leverage, maxBalance)
    }, 1000 * 30)    
}

main();
