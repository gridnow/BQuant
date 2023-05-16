const crypto = require('crypto');
const axios = require('axios');
const EventEmitter  = require('events');
const WebSocket = require('ws');

async function getAllContracts() {
    return axios.get('https://fapi.binance.com/fapi/v1/exchangeInfo').then((ret) => {
        return {data: ret.data.symbols};
    })
}

async function getKlines(pa) {
    let time = pa.time || '15m';
    let symbol = pa.symbol;
    return axios.get(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${time}&limit=20`).then(ret => {
        return {data: ret.data}
    })
}

/**
 * 获取费率
 * 
 * @returns {Promise<{symbol: string, lastFundingRate: string, nextFundingTime: string}[]>}
 */
async function getPremiumIndex() {
    const {data} = await axios.get("https://fapi.binance.com/fapi/v1/premiumIndex");
    return data;
}

const getRequestInstance = (config) => {
    return axios.create({
      ...config,
    });
};

const buildQueryString = (q) => (q ? `?${Object.keys(q)
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(q[k])}`)
    .join('&')}` : '');

class BianAPI extends EventEmitter  {
    constructor(test=false) {
        super();
        test = true
        this.baseUrl = 'https://fapi.binance.com';
        this.wsUrl = 'wss://fstream.binance.com/ws/';
        // WSH
        this.apiKey = 'your real key'
        this.apiSec = 'your real sec'

        if (test) {
            this.baseUrl = 'https://testnet.binancefuture.com';
            this.wsUrl = 'wss://stream.binancefuture.com/ws/';
            this.apiKey = 'your test key'
            this.apiSec = 'your test sec'
        }

        this.updateListenKeyTimer = null;
        this.ws = null;
        this.accountWebSocket = null;
        /* 通讯的时候需要一个编号给服务端 */
        this.wsId = 0
    }

    async deattach() {
        try {
            if (this.updateListenKeyTimer != null) {
                clearInterval(this.updateListenKeyTimer);
                this.updateListenKeyTimer = null;
            }
        } catch(e) {
            console.log("clearInterval error ", e);
        }
        try {
            if (this.ws != null) {
                this.ws.close();
                this.ws = null;
            }
        } catch(e) {
            console.log("this ws close error ", e);
        }
        try {
            if (this.accountWebSocket != null) {
                this.accountWebSocket.close();
                this.accountWebSocket = null;
            }
        } catch(e) {
            console.log("this accountWebSocket close error ", e);
        }
    }

    async webSocketInit() {
        this.ws = new WebSocket(this.wsUrl, {
        });

        return new Promise((resolve, reject)=> {
            this.ws.on('open', () => {
                console.log("websocket open")
                this.emit('open')

                this.ws.on('message', (msg) => {
                    try {
                        const message = JSON.parse(msg);
                        if (message.e) {
                          this.handleMessageStream(message);
                        } else {
                            if (message.id && message.result == null) {
                                // subscribe ok
                            } else {
                                console.warn('Unknown method at webSocketInit', message);
                            }
                        }
                      } catch (e) {
                        console.warn('Parse message failed', e);
                      }
                })
                this.ws.on('error', (code) => {
                    console.log('websocket error with code ', code);
                    this.emit('error', code)
                })
                this.ws.on('close', (code) => {
                    console.log('websocket closed with code ', code);
                    this.emit('close', code)
                })
                this.ws.on('ping', (data) => {
                    this.ws.pong(data);
                })
                resolve()
            })
        })
    }

    async accountListenKeyInfoInit() {
        const { listenKey } = await this.getListenKey();
        this.updateListenKeyTimer = setInterval(()=> {
            console.log("auto update listenKey every 55 min")
            this.updateListenKey()
        }, 1000 * 60 * 55);

        const baseWs = this.wsUrl;
        this.accountWebSocket = new WebSocket(`${baseWs}${listenKey}`, {
        });

        return new Promise((resolve, reject)=> {
            this.accountWebSocket.on('open', () => {
                console.log("accountWebSocket websocket open")
                this.emit('open')

                this.accountWebSocket.on('message', (msg) => {
                    try {
                        const message = JSON.parse(msg);
                        if (message.e) {
                          this.handleAccountMessageStream(message);
                        } else {
                          console.warn('Unknown method at accountListenKeyInfoInit', message);
                        }
                      } catch (e) {
                        console.warn('accountWebSocket Parse message failed', e);
                      }
                })
                this.accountWebSocket.on('error', (code) => {
                    console.log('accountWebSocket websocket error with code ', code);
                    this.emit('error', code)
                })
                this.accountWebSocket.on('close', (code) => {
                    console.log('accountWebSocket websocket closed with code ', code);
                    this.emit('close', code)
                })
                this.accountWebSocket.on('ping', (data) => {
                    this.accountWebSocket.pong(data);
                })
                resolve()
            })
        })

    }

    handleMessageStream(msg) {
        const { e } = msg;
        if (e == 'markPriceUpdate') {
            this.emit('markPriceUpdate', msg)
        } else {
            console.warn('Unknow msg with ', msg)
        }
    }

    handleAccountMessageStream(msg) {
        const { e } = msg;
        if (e == 'ACCOUNT_UPDATE') {
            this.emit('accountUpdate', msg)
        } else if (e == 'ORDER_TRADE_UPDATE') {
            this.emit('orderTradeUpdate', msg)
        } else if (e == 'ACCOUNT_CONFIG_UPDATE') {
        } else {
            console.warn('Unknow msg with ', msg)
        }
    }

    subscribeMarkPrice(symbol) {
        symbol = symbol.toLowerCase()
        this.wsId = this.wsId + 1
        this.ws.send(JSON.stringify({
            "method": "SUBSCRIBE",
            "params": [
                `${symbol}@markPrice`
            ],
            "id": this.wsId
        }), (err)=> {
            if (err)
		        console.log(`symbol ${symbol} subscribeMarkPrice err `, err)
	    })
    }

    unsubscribeMarkPrice(symbol) {
        symbol = symbol.toLowerCase()
        this.wsId = this.wsId + 1
        this.ws.send(JSON.stringify({
            "method": "UNSUBSCRIBE",
            "params": [
                `${symbol}@markPrice`
            ],
            "id": this.wsId
        }), (err) => {
            if (err)
                console.log(`symbol ${symbol} unsubscribeMarkPrice err `, err)
        })
    }

    async httpGet(url) {
        return axios.get(this.baseUrl + '/' + url).then((ret) => {
            return ret.data
        })
    }

    async getAllContracts() {
        //const ret = await getAllContracts();
        const ret = await this.httpGet('fapi/v1/exchangeInfo');
        return ret.symbols.filter(s=> s.contractType == "PERPETUAL");
    }

    async getKlines(pa, limit=20) {
        //const kline = await getKlines(pa);
        let time = pa.time || '15m';
        let symbol = pa.symbol;
        const kline = await this.httpGet(`fapi/v1/klines?symbol=${symbol}&interval=${time}&limit=${limit}`);
        return kline;
    }

    publicDataRequest(params={}, data={}) {
        return getRequestInstance({
            baseURL: this.baseUrl,
            headers: {
              'content-type': 'application/json',
              'X-MBX-APIKEY': this.apiKey,
            },
            params,
            data
        });
    }

    privateDataRequest(params={}, data={}) {
        const timestamp = Date.now();

        const signature = crypto
          .createHmac('sha256', this.apiSec)
          .update(buildQueryString({ ...params, ...data, timestamp }).substr(1))
          .digest('hex');

        return getRequestInstance({
            baseURL: this.baseUrl,
            headers: {
              'content-type': 'application/json',
              'X-MBX-APIKEY': this.apiKey,
            },
            params: {...params, timestamp, signature},
            data: data
        });
    }

    async getListenKey() {
        // POST /fapi/v1/listenKey 
        return this.publicDataRequest().post('/fapi/v1/listenKey').then((ret) => {
            return ret.data
        }).catch(err=> {
            console.log("getListenKey error ", err)
            throw err
        })
    }

    async updateListenKey() {
        //PUT /fapi/v1/listenKey
        return this.publicDataRequest().put('/fapi/v1/listenKey').then((ret) => {
            return ret.data
        }).catch(err=> {
            console.log("updateListenKey error ", err)
            throw err
        })
    }

    async getLatestPrice(symbol) {
        // GET /fapi/v1/premiumIndex (HMAC SHA256) 
        return this.privateDataRequest({symbol}).get('/fapi/v1/premiumIndex').then((ret) => {
            return ret.data
        }).catch(err=> {
            console.log("getLatestPrice error ", err)
            throw err
        })
    }

    async getIncome(data) {
        // GET /fapi/v1/income (HMAC SHA256) 
        return this.privateDataRequest().get('/fapi/v1/income').then((ret) => {
            return ret.data
        }).catch(err=> {
            console.log("getIncome error ", err)
            throw err
        })
    }

    async getBanlance(asset) {
        // GET /fapi/v2/balance (HMAC SHA256) 
        return this.privateDataRequest().get('/fapi/v2/balance').then((ret) => {
            let b = ret.data.find(e => e.asset == asset);
            return b
        }).catch(err=> {
            console.log("getBanlance error ", err)
            throw err
        })
    }

    async getPositions(data) {
        //GET /fapi/v2/account (HMAC SHA256) 
        return this.privateDataRequest().get('/fapi/v2/account').then((ret) => {
            let p = ret.data.positions;
            p = p.filter((e)=> {
                let i = parseFloat(e.positionAmt);
                if (i != 0) {
                    return true;
                }
                return false;
            })
            return p;
        }).catch(err=> {
            console.log("getPositions error ", err)
            throw err
        })
    }

    async order(odr) {
        // POST /fapi/v1/order (HMAC SHA256)
        return this.privateDataRequest(odr).post('/fapi/v1/order').then((ret) => {
            return ret.data
        }).catch(err=> {
            console.log("order error ", err.response.data)
            throw err
        })
    }

    async batchOrder(orders) {
        //  POST /fapi/v1/batchOrders (HMAC SHA256) 
        return this.privateDataRequest({batchOrders: orders}).post('/fapi/v1/batchOrders').then((ret) => {
            return ret.data
        }).catch(err=> {
            console.log("batchOrder error ", err)
            throw err
        })
    }

    async orderCancel(symbol, id) {
        //   DELETE /fapi/v1/order (HMAC SHA256) 
        return this.privateDataRequest({symbol: symbol, orderId: id}).delete('/fapi/v1/order').then((ret) => {
            return ret.data
        }).catch(err=> {
            console.log("orderCancel error ", err.response.data, "order id", id, "symbol", symbol)
            throw err
        })
    }

    async getAllOpenOrder() {
        //GET /fapi/v1/openOrders (HMAC SHA256)
        return this.privateDataRequest().get('/fapi/v1/openOrders').then((ret) => {
            return ret.data;
        }).catch(err=> {
            console.log("getAllOpenOrder error ", err)
            throw err
        }) 
    }

    async orderCancelBySymbol(symbol) {
        //DELETE /fapi/v1/allOpenOrders (HMAC SHA256) 
        return this.privateDataRequest({symbol}).delete('/fapi/v1/allOpenOrders').then((ret) => {
            return ret.data;
        }).catch(err=> {
            console.log("orderCancelBySymbol error ", err)
            throw err
        })
    }

    async adjustLeverage(symbol, leverage) {
        //POST /fapi/v1/leverage (HMAC SHA256) 
        return this.privateDataRequest({symbol, leverage}).post('/fapi/v1/leverage').then((ret) => {
            return ret.data
        }).catch(err=> {
            console.log("adjustLeverage error ", err.response.data, "leverage", leverage, "symbol", symbol)
            throw err
        })
    }
    async adjustMarginType(symbol, isolated) {
        //POST /fapi/v1/marginType (HMAC SHA256) 
        return this.privateDataRequest({symbol, isolated}).post('/fapi/v1/marginType').then((ret) => {
            return ret.data
        }).catch(err=> {
            throw err
        })
    }

    async getPositionSide() {
        //  GET /fapi/v1/positionSide/dual (HMAC SHA256) 
        return this.privateDataRequest().get('fapi/v1/positionSide/dual').then((ret) => {
            return ret.data;
        }).catch(err=> {
            console.log("getPositionSide error ", err)
            throw err
        })
    }

    async getLatestUp(time='15m') {
        try {
            return axios.get(`http://47.91.17.176:50004/blist?time=${time}&needjson=1&orderby=0`).then(ret => {
            //return axios.get(`http://127.0.0.1:50004/blist?time=${time}&needjson=1&orderby=0`).then(ret => {
                return ret.data;
            })
        } catch(e) {
            return axios.get(`http://47.91.17.176:50004/blist?time=${time}&needjson=1&orderby=0`).then(ret => {
                return ret.data;
            })
        }
    }
}

module.exports = {
    getAllContracts,
    getKlines,
    getPremiumIndex,
    BianAPI
}
